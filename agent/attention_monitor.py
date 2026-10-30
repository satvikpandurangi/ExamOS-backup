"""Offline attention monitoring. Tracks student focus and detects suspicious behaviors.
Only captures evidence when ACTUAL cheating is detected during an active examination."""

import cv2
import numpy as np
import time
import uuid
from datetime import datetime, timezone
from collections import deque

# Constants - STRICTER thresholds to reduce false positives
# Only flag as cheating after SUSTAINED suspicious behavior
LOOKING_AWAY_MIN_DURATION = 3.0  # Seconds of sustained looking away before flagging
NOT_FACING_MIN_DURATION = 2.0  # Seconds not facing camera
NO_FACE_MIN_DURATION = 4.0  # Seconds with no face detected
SIDE_GLANCE_MIN_COUNT = 3  # Number of side glances before flagging

# Cooldowns between capture events (prevent spam)
CAPTURE_COOLDOWN = 10.0  # Seconds between captures


class FaceAttentionDetector:
    """Detects face, gaze direction, and attention state from webcam frames."""

    def __init__(self):
        # Load face detection model (using Haar cascades as fallback)
        self.face_cascade = cv2.CascadeClassifier(
            cv2.data.haarcascades + 'haarcascade_frontalface_default.xml'
        )
        self.eye_cascade = cv2.CascadeClassifier(
            cv2.data.haarcascades + 'haarcascade_eye.xml'
        )

        # Attention state tracking - tracks when behaviors STARTED
        self.behavior_start = {}  # When a behavior first started
        self.side_glance_count = 0  # Count repeated side glances
        self.last_side_glance_time = 0
        self.frame_history = deque(maxlen=30)  # Last 30 frames (~7.5 seconds at 4fps)

    def detect_faces(self, frame):
        """Detect faces in the frame and return their locations and attention state."""
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        faces = self.face_cascade.detectMultiScale(
            gray, scaleFactor=1.1, minNeighbors=5, minSize=(60, 60)
        )

        results = []
        for (x, y, w, h) in faces:
            face_roi = frame[y:y+h, x:x+w]
            face_gray = gray[y:y+h, x:x+w]

            # Detect eyes within face
            eyes = self.eye_cascade.detectMultiScale(
                face_gray, scaleFactor=1.1, minNeighbors=3, minSize=(20, 20)
            )

            # Estimate gaze direction based on eye positions
            gaze_direction = self._estimate_gaze(face_gray, eyes, (w, h))

            # Determine attention state
            attention_state = self._estimate_attention(gaze_direction, (w, h))

            results.append({
                'bbox': (x, y, x+w, y+h),
                'confidence': 0.85,
                'gaze_direction': gaze_direction,
                'attention_state': attention_state,
                'eyes': eyes,
                'frame_time': time.monotonic()
            })

        return results

    def _estimate_gaze(self, face_gray, eyes, face_size):
        """Estimate gaze direction based on eye positions."""
        if len(eyes) < 2:
            return {'direction': 'center', 'confidence': 0.3}

        eyes_sorted = sorted(eyes, key=lambda e: e[1])
        eye_centers = []
        for (ex, ey, ew, eh) in eyes_sorted[:2]:
            eye_centers.append((ex + ew/2, ey + eh/2))

        if len(eye_centers) < 2:
            return {'direction': 'center', 'confidence': 0.3}

        eye_angle = np.degrees(np.arctan2(
            eye_centers[1][1] - eye_centers[0][1],
            eye_centers[1][0] - eye_centers[0][0]
        ))

        left_eye_center = eye_centers[0]
        right_eye_center = eye_centers[1]
        face_center_x = face_size[0] / 2

        left_offset = left_eye_center[0] - face_center_x
        right_offset = right_eye_center[0] - face_center_x

        # More strict thresholds - require SIGNIFICANT offset for "away"
        if abs(left_offset) < face_size[0] * 0.12 and abs(right_offset) < face_size[0] * 0.12:
            direction = 'forward'
            confidence = 0.8
        elif left_offset < -face_size[0] * 0.25:
            direction = 'left'
            confidence = 0.7
        elif right_offset < -face_size[0] * 0.25:
            direction = 'right'
            confidence = 0.7
        elif left_offset > face_size[0] * 0.25 or right_offset > face_size[0] * 0.25:
            direction = 'away'
            confidence = 0.75
        else:
            direction = 'center'
            confidence = 0.5

        return {
            'direction': direction,
            'confidence': confidence,
            'eye_angle': float(eye_angle)
        }

    def _estimate_attention(self, gaze, face_size):
        """Estimate overall attention state from gaze."""
        direction = gaze.get('direction', 'center')

        if direction == 'forward':
            return {'state': 'facing_screen', 'score': 0.95}
        elif direction in ('left', 'right'):
            return {'state': 'looking_away', 'score': 0.75}
        elif direction == 'away':
            return {'state': 'not_facing_camera', 'score': 0.85}
        else:
            return {'state': 'uncertain', 'score': 0.4}

    def reset_counters(self):
        """Reset behavior counters."""
        self.behavior_start = {}
        self.side_glance_count = 0
        self.last_side_glance_time = 0
        self.frame_history.clear()

    def update(self, detections, exam_active=True):
        """Update attention state and return ONLY actual cheating behaviors.

        Args:
            detections: Face detection results from current frame
            exam_active: Only flag cheating during active exam (default True)
        """
        now = time.monotonic()
        cheating = []  # Only actual cheating, not normal behavior

        # Track frame history
        self.frame_history.append({
            'time': now,
            'detections': detections,
            'has_face': len(detections) > 0
        })

        # If no exam is active, don't flag anything
        if not exam_active:
            self.reset_counters()
            return cheating

        if not detections:
            # No face detected - could be cheating (looking away from camera)
            if 'no_face_detected' not in self.behavior_start:
                self.behavior_start['no_face_detected'] = now
            else:
                duration = now - self.behavior_start['no_face_detected']
                if duration >= NO_FACE_MIN_DURATION:
                    cheating.append({
                        'category': 'no_face_detected',
                        'detail': {'duration': round(duration, 1)},
                        'severity': 'high'
                    })
            return cheating

        # Reset face-related tracking when face is detected
        if 'no_face_detected' in self.behavior_start:
            del self.behavior_start['no_face_detected']

        # Analyze first detected face
        face = detections[0]
        gaze = face.get('gaze_direction', {})
        attention = face.get('attention_state', {})

        # Check for SUSTAINED looking away (not quick glances)
        if attention.get('state') == 'looking_away':
            if 'looking_away' not in self.behavior_start:
                self.behavior_start['looking_away'] = now
            else:
                duration = now - self.behavior_start['looking_away']
                if duration >= LOOKING_AWAY_MIN_DURATION:
                    cheating.append({
                        'category': 'looking_away',
                        'detail': {
                            'direction': gaze.get('direction', 'unknown'),
                            'duration': round(duration, 1)
                        },
                        'severity': 'medium'
                    })
                    # Reset after flagging to prevent repeated flags
                    self.behavior_start['looking_away'] = now

        # Check for not facing camera at all (serious)
        if attention.get('state') == 'not_facing_camera':
            if 'not_facing_camera' not in self.behavior_start:
                self.behavior_start['not_facing_camera'] = now
            else:
                duration = now - self.behavior_start['not_facing_camera']
                if duration >= NOT_FACING_MIN_DURATION:
                    cheating.append({
                        'category': 'not_facing_camera',
                        'detail': {'duration': round(duration, 1)},
                        'severity': 'high'
                    })
                    self.behavior_start['not_facing_camera'] = now

        # Check for MULTIPLE side glances (pattern of looking around, not just one glance)
        if gaze.get('direction') in ('left', 'right'):
            if 'side_glance' not in self.behavior_start:
                self.behavior_start['side_glance'] = now
                self.side_glance_count = 1
                self.last_side_glance_time = now
            else:
                # If this is a NEW glance (not too close to last)
                if now - self.last_side_glance_time > 1.0:
                    self.side_glance_count += 1
                    self.last_side_glance_time = now

                # Only flag if multiple repeated glances
                if self.side_glance_count >= SIDE_GLANCE_MIN_COUNT:
                    cheating.append({
                        'category': 'repeated_side_glances',
                        'detail': {
                            'count': self.side_glance_count,
                            'direction': gaze.get('direction')
                        },
                        'severity': 'medium'
                    })
                    # Reset after flagging
                    self.side_glance_count = 0

        return cheating


class AttentionMonitor:
    """Monitors student attention and detects ACTUAL cheating behaviors only."""

    def __init__(self, event_callback, snapshot_callback, cooldowns=None):
        self.event_callback = event_callback  # Send events to server
        self.snapshot_callback = snapshot_callback  # Take snapshot ONLY on confirmed cheating
        self.detector = FaceAttentionDetector()
        self.suspended = False
        self.session_id = None
        self.exam_active = False  # Only active during started exam
        self.enabled = False
        self.last_event_time = {}
        self.last_snapshot_time = 0
        self.cooldowns = cooldowns or {
            'looking_away': 5.0,
            'repeated_side_glances': 5.0,
            'not_facing_camera': 8.0,
            'no_face_detected': 8.0
        }

        # Snapshot buffer - only keeps frames when suspicious
        self.snapshot_buffer = deque(maxlen=10)

    def start(self, session_id, exam_active=False):
        """Start attention monitoring. Only captures during active exam."""
        self.session_id = session_id
        self.exam_active = exam_active  # Won't capture snapshots unless exam is active
        self.enabled = True
        self.suspended = False
        self.last_event_time = {}
        self.last_snapshot_time = 0
        self.detector = FaceAttentionDetector()

    def set_exam_active(self, active):
        """Update exam active state - only captures when True."""
        self.exam_active = active

    def stop(self):
        """Stop attention monitoring."""
        self.enabled = False
        self.session_id = None
        self.exam_active = False
        self.suspended = True
        self.detector.reset_counters()

    def process_frame(self, frame, jpeg_bytes=None):
        """Process webcam frame and detect ONLY actual cheating.

        Key logic:
        - Only process if enabled AND not suspended
        - Only capture snapshots if exam is ACTUALLY active
        - Only flag SUSTAINED suspicious behavior (not quick glances)
        - Has cooldown to prevent snapshot spam
        """
        if not self.enabled or self.suspended:
            return

        # Detect faces and analyze attention
        detections = self.detector.detect_faces(frame)

        # Get actual cheating behaviors ONLY (pass exam_active to filter)
        cheating = self.detector.update(detections, exam_active=self.exam_active)

        # Buffer frames ONLY when suspicious behavior is detected
        if cheating and jpeg_bytes is not None:
            self.snapshot_buffer.append({
                'frame': frame.copy(),
                'jpeg': jpeg_bytes,
                'time': time.monotonic()
            })

        # Process actual cheating events - NOT normal behavior
        for event in cheating:
            category = event['category']
            now = time.monotonic()

            # Check cooldown between captures
            if category in self.last_event_time:
                cooldown = self.cooldowns.get(category, 5.0)
                if now - self.last_event_time[category] < cooldown:
                    continue

            self.last_event_time[category] = now

            # ONLY send to server if exam is actually active
            if not self.exam_active:
                continue

            # Send event to server (teacher gets notified)
            payload = {
                'sessionId': self.session_id,
                'category': f'attention_{category}',
                'clientEventId': str(uuid.uuid4()),
                'detail': event['detail'],
                'severity': event['severity'],
                'examActive': True,
                'observedAt': datetime.fromtimestamp(
                    time.time(), timezone.utc
                ).isoformat(timespec='milliseconds')
            }

            self.event_callback(payload)

            # CRITICAL: Only capture snapshot if:
            # 1. Exam is actually in progress (exam_active=True)
            # 2. Hasn't captured recently (cooldown)
            # 3. Has buffered frames
            if self.exam_active and now - self.last_snapshot_time >= CAPTURE_COOLDOWN:
                self._capture_snapshot(event)

    def _capture_snapshot(self, event):
        """Capture and send snapshot ONLY for confirmed cheating."""
        self.last_snapshot_time = time.monotonic()

        # Get most recent buffered frame
        if self.snapshot_buffer:
            recent = self.snapshot_buffer[-1]
            snapshot_data = {
                'snapshot': recent['jpeg'],
                'category': event['category'],
                'severity': event['severity'],
                'examActive': True,
                'timestamp': datetime.fromtimestamp(
                    time.time(), timezone.utc
                ).isoformat(timespec='milliseconds'),
                'detail': event['detail'],
                'evidence': True  # This is actual evidence, not just monitoring
            }

            # Trigger snapshot callback - only for confirmed cheating
            if self.snapshot_callback:
                self.snapshot_callback(snapshot_data)

            # Clear buffer after capture
            self.snapshot_buffer.clear()

    def suspend(self):
        """Temporarily suspend monitoring (e.g., during exam hold/pause)."""
        self.suspended = True
        self.exam_active = False  # Don't capture during suspend

    def resume(self, exam_active=False):
        """Resume monitoring. Only capture if exam is active."""
        self.suspended = False
        self.exam_active = exam_active

    def is_monitoring(self):
        """Check if attention monitoring is active."""
        return self.enabled and not self.suspended