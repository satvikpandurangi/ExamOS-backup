"""Offline object counts only. Camera is opened only by an explicitly consented worker."""
import base64
import hashlib
import threading
import time
import uuid
from collections import deque
from datetime import datetime, timezone
from pathlib import Path

import cv2
import numpy as np
from event_clip import encode_clip
from event_gate import EventGate

MODEL_HASH = 'c5c2d13e59ae883e6af3b45daea64af4833a4951c92d116ec270d9ddbe998063'




class Detector:
    def __init__(self):
        model = Path(__file__).parent / 'models' / 'yolox.onnx'
        if hashlib.sha256(model.read_bytes()).hexdigest() != MODEL_HASH:
            raise ValueError('Camera detection model missing or checksum mismatch')
        self.net = cv2.dnn.readNetFromONNX(str(model))
        grid, strides = [], []
        for stride in (8, 16, 32):
            y, x = np.meshgrid(np.arange(640 // stride), np.arange(640 // stride), indexing='ij')
            grid.append(np.stack((x, y), axis=-1).reshape(-1, 2))
            strides.append(np.full((x.size, 1), stride))
        self.grid = np.concatenate(grid)
        self.strides = np.concatenate(strides)

    def counts(self, frame):
        h, w = frame.shape[:2]
        ratio = min(640 / h, 640 / w)
        resized = cv2.resize(frame, (int(w * ratio), int(h * ratio)))
        canvas = np.full((640, 640, 3), 114, dtype=np.uint8)
        canvas[:resized.shape[0], :resized.shape[1]] = resized
        # OpenCV Zoo YOLOX uses raw BGR, CHW, no scaling/mean subtraction.
        blob = cv2.dnn.blobFromImage(canvas, 1.0, (640, 640), swapRB=False)
        self.net.setInput(blob)
        rows = self.net.forward().reshape(-1, 85).copy()
        rows[:, :2] = (rows[:, :2] + self.grid) * self.strides
        rows[:, 2:4] = np.exp(np.clip(rows[:, 2:4], -10, 10)) * self.strides
        counts = {}
        best = 0.0
        # Categories: 0 = person, 63 = laptop, 67 = cell phone, 73 = book
        categories = (
            (0, 'personCount'),
            (63, 'laptopCount'),
            (67, 'phoneCount'),
            (73, 'bookCount')
        )
        for category, name in categories:
            confidence = rows[:, 4] * rows[:, 5 + category]
            selected = rows[confidence >= 0.35]  # Lower threshold to 0.35 for sensitive detection
            scores = confidence[confidence >= 0.35]
            boxes = np.concatenate((selected[:, :2] - selected[:, 2:4] / 2, selected[:, 2:4]), axis=1)
            indices = cv2.dnn.NMSBoxes(boxes.tolist(), scores.tolist(), .35, .45)
            counts[name] = len(indices)
            conf_key = name.replace('Count', 'Confidence')
            counts[conf_key] = round(float(scores[np.array(indices).flatten()].min()), 3) if len(indices) else None
            if len(indices):
                best = max(best, float(scores[np.array(indices).flatten()].max()))
        counts['confidence'] = round(best, 3)
        return counts


class CameraMonitor:
    def __init__(self, call, show, eligible):
        self.call, self.show, self.eligible = call, show, eligible
        self.stop_event = threading.Event()
        self.thread = None
        self.lock = threading.RLock()
        self.status = 'off'
        self.session_id = None
        self.lease_until = 0
        self.indicator_ready = threading.Event()
        self.check_requested = threading.Event()
        self.generation = 0
        self.upload_slots = threading.BoundedSemaphore(2)
        self.check_lock=threading.Lock()
        self.requested_check_id=None
        self.snapshots_enabled=False

    def running(self):
        return bool(self.thread and self.thread.is_alive())

    def stop(self):
        self.stop_event.set()
        self.status = 'stopping' if self.running() else 'off'

    def start(self, session_id, snapshots, device_index=0, clips=False, consent_policy=None):
        if self.running():
            return
        self.stop_event.clear()
        self.indicator_ready.clear()
        self.check_requested.clear()
        self.requested_check_id=None
        self.snapshots_enabled=bool(snapshots)
        self.session_id = session_id
        self.generation += 1
        self.status = 'starting'
        policy=dict(consent_policy or {'retentionDays':7,'clipSeconds':10,'cooldownSeconds':15})
        self.thread = threading.Thread(target=self._run, args=(session_id, snapshots, device_index, clips, self.generation,policy), daemon=True)
        self.thread.start()

    def permitted(self):
        return not self.stop_event.is_set() and time.monotonic() < self.lease_until and self.eligible(self.session_id)

    def request_check(self,request_id=None):
        if self.status!='active' or not self.permitted() or not self.snapshots_enabled:
            return False
        with self.check_lock:
            if self.check_requested.is_set():
                return False
            self.requested_check_id=request_id
            self.check_requested.set()
        self.show('evidence_progress','Camera check requested — capturing the next consented webcam frame')
        return True

    def _run(self, sid, snapshots, index, clips, generation,policy):
        capture = None
        granted = False
        status = 'off'
        try:
            granted = True
            result = self.call('camera-consent', {'sessionId': sid, 'accept': True, 'snapshots': snapshots, 'clips': bool(clips and snapshots),**{k:policy.get(k,v) for k,v in [('retentionDays',7),('clipSeconds',10),('cooldownSeconds',15)]}})
            if not result.get('ok'):
                raise ValueError(result.get('error', 'Camera consent rejected'))
            granted = True
            grant = result.get('grantId')
            self.grant=grant
            self.grant_accepted_at=time.monotonic()
            self.clips_enabled=bool(clips and snapshots and grant)
            clip_seconds = max(4,min(20,int(result.get('clipSeconds',10))))
            cooldown = max(5,min(300,int(result.get('cooldownSeconds',15))))
            clock_offset = datetime.fromisoformat(result['serverNow'].replace('Z','+00:00')).timestamp()-time.time() if result.get('serverNow') else 0
            clip_enabled = bool(clips and snapshots and grant)
            ring, pending = deque(maxlen=81), []
            detector = Detector()
            if not self.permitted():
                return
            self.status = 'active'
            self.show('camera_state', 'CAMERA ACTIVE — opening consented device; object detection active')
            if not self.indicator_ready.wait(2) or not self.permitted():
                return
            capture = cv2.VideoCapture(index, cv2.CAP_DSHOW)
            capture.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
            capture.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)
            if not capture.isOpened():
                status = 'unavailable'
                raise ValueError('Webcam unavailable. Check Windows camera privacy permission.')
            if not self.permitted():
                return
            result = self.call('camera-status', {'sessionId': sid, 'status': 'active'})
            if not result.get('ok'):
                raise ValueError(result.get('error', 'Camera permission ended'))
            self.status = 'active'
            self.show('camera_state', 'CAMERA ACTIVE — live object detection & snapshot monitoring')
            if not self.indicator_ready.wait(2) or not self.permitted():
                return
            gate = EventGate()
            first_frame=True
            while self.permitted():
                ok, frame = capture.read()
                if not ok or frame is None or frame.size == 0 or frame.ndim != 3 or frame.shape[2] != 3:
                    status = 'disconnected'
                    raise ValueError('Webcam disconnected or capture failed.')
                if not self.permitted():
                    break
                if first_frame:
                    self.show('frame_captured','valid real webcam frame')
                    first_frame=False
                stamp = time.monotonic()
                wall = time.time()+clock_offset
                jpeg_bytes = None
                # ALWAYS capture snapshots when snapshots are enabled and suspicious object/behavior is detected
                if snapshots:
                    encoded, jpg = cv2.imencode('.jpg', cv2.resize(frame,(640,480)),[cv2.IMWRITE_JPEG_QUALITY,80]) # higher quality 80 for clear admin view
                    if not encoded:
                        raise ValueError('Snapshot encoding failed')
                    jpeg_bytes = jpg.tobytes()
                    if cv2.imdecode(np.frombuffer(jpeg_bytes,dtype=np.uint8),cv2.IMREAD_COLOR) is None:
                        raise ValueError('Corrupted snapshot')
                if clip_enabled:
                    item=(stamp,wall,jpeg_bytes)
                    ring.append(item)
                    while ring and stamp-ring[0][0]>clip_seconds/2:
                        ring.popleft()
                    for job in list(pending):
                        if stamp<=job['until']:
                            job['frames'].append(item)
                        if stamp>=job['until']:
                            pending.remove(job)
                            self._queue_clip(sid,job,grant,generation)

                counts = detector.counts(frame)
                gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)

                # Suspicious behavior rules:
                # - phone_detected: phoneCount > 0 (threshold 1 second for rapid detection)
                # - book_detected: bookCount > 0 (threshold 1 second for books/notes)
                # - laptop_detected: laptopCount > 0 (unauthorized secondary device)
                # - no_person_detected: personCount == 0 (student left seat)
                # - multiple_people: personCount > 1 (someone else in frame)
                # - camera_obstructed: dark / blurred
                facts = {
                    'phone_detected': (counts['phoneCount'] > 0, 1),
                    'book_detected': (counts['bookCount'] > 0, 1),
                    'laptop_detected': (counts['laptopCount'] > 0, 1),
                    'no_person_detected': (counts['personCount'] == 0, 3),
                    'multiple_people': (counts['personCount'] > 1, 2),
                    'camera_obstructed': (float(gray.mean()) < 12 and float(gray.std()) < 10, 2)
                }

                request_id=None
                if self.check_requested.is_set():
                    with self.check_lock:
                        request_id=self.requested_check_id
                        self.requested_check_id=None
                        self.check_requested.clear()
                    facts['camera_check'] = (True, 0)

                preview = cv2.cvtColor(cv2.resize(frame, (240, 135)), cv2.COLOR_BGR2RGB)
                with self.lock:
                    if not self.permitted():
                        break
                    self.show('camera_frame', preview)

                now = time.monotonic()
                for category, (present, threshold) in facts.items():
                    if category!='camera_check' and not gate.eligible(category,present,now,threshold,cooldown):
                        continue
                    if category=='camera_check':
                        gate.since[category]=now

                    confidence = (counts.get('phoneConfidence') if category=='phone_detected' else
                                  counts.get('bookConfidence') if category=='book_detected' else
                                  counts.get('laptopConfidence') if category=='laptop_detected' else
                                  counts.get('personConfidence') if category=='multiple_people' else None)

                    detail = {k:v for k,v in counts.items() if k in ('personCount','phoneCount','bookCount','laptopCount')}
                    detail['seconds']=round(now-gate.since[category],1)
                    if confidence is not None:
                        detail['confidence']=confidence

                    detected_wall=time.time()+clock_offset
                    payload = {
                        'sessionId': sid,
                        'category': category,
                        'clientEventId': str(uuid.uuid4()),
                        'detail': detail,
                        'grantId': grant,
                        'observedAt': datetime.fromtimestamp(detected_wall, timezone.utc).isoformat(timespec='milliseconds'),
                        'capturedAt': datetime.fromtimestamp(wall, timezone.utc).isoformat(timespec='milliseconds'),
                        'clipExpected': clip_enabled and len(pending)<2
                    }
                    if category=='camera_check' and request_id:
                        payload['requestId']=request_id
                    if snapshots:
                        payload['jpeg'] = base64.b64encode(jpeg_bytes).decode('ascii')

                    with self.lock:
                        if not self.permitted():
                            break
                        response = self.call('proctor-event', payload)
                    if not response.get('ok'):
                        raise ValueError(response.get('error', 'Observation rejected'))
                    if response.get('throttled'):
                        continue
                    if response.get('hasEvidence'):
                        self.show('snapshot_saved', response.get('evidenceId') or response['id'])
                    gate.commit(category, now)
                    if response.get('id') and response.get('clipExpected') and clip_enabled:
                        pending.append({'id':response['id'],'frames':list(ring),'until':now+clip_seconds/2})
                self.stop_event.wait(0.5) # Check frames every 500ms for responsive detection
        except Exception as exc:
            if not self.stop_event.is_set():
                self.show('camera_state', 'CAMERA STOPPED: ' + str(exc))
                if status == 'off':
                    status = 'unavailable'
        finally:
            if 'ring' in locals():
                ring.clear()
                if pending:
                    self.show('evidence_error','Camera stopped: incomplete clips unavailable.')
                pending.clear()
            if capture is not None:
                capture.release()
            self.status = 'off'
            self.show('camera_frame', None)
            if granted:
                try:
                    self.call('camera-status', {'sessionId': sid, 'status': status})
                except Exception:
                    pass
            self.show('camera_released', status)

    def _queue_clip(self, sid, job, grant, generation):
        if not self.upload_slots.acquire(blocking=False):
            return
        def work():
            allowed=lambda:self.permitted() and generation==self.generation and sid==self.session_id
            try:
                data=encode_clip(job['frames'],allowed)
                if not allowed():
                    return
                result=self.call('incident-clip',{'sessionId':sid,'id':job['id'],'dependency':job['id'],'grantId':grant,'bytes':data,
                    'startedAt':datetime.fromtimestamp(job['frames'][0][1],timezone.utc).isoformat(timespec='milliseconds'),
                    'endedAt':datetime.fromtimestamp(job['frames'][-1][1],timezone.utc).isoformat(timespec='milliseconds')})
                if not result.get('ok'):
                    raise ValueError(result.get('error','Clip storage failed'))
                if not result.get('queued'):
                    self.show('evidence_saved',job['id'])
            except Exception as exc:
                if allowed():
                    self.show('evidence_error','Clip not saved: '+str(exc))
            finally:
                job['frames'].clear()
                self.upload_slots.release()
        threading.Thread(target=work,daemon=True).start()
