"""Offline attention monitoring. Tracks student focus and detects suspicious behaviors."""
import cv2
import numpy as np
import time
import uuid
from datetime import datetime, timezone
from collections import deque

# Constants for detection thresholds
FACING_THRESHOLD = 0.65  # Minimum face detection confidence
LOOKINGAway_THRESHOLD = 0.55  # Face direction threshold for "looking away"
GLANCE_THRESHOLD = 3.0  # Seconds between glances to count as suspicious
SIDESWAP_THRESHOLD = 2.0  # Seconds between screen/other glances to count as suspicious
MIN_FRAME_CONFIDENCE = 0.5  # Minimum overall confidence for a frame to be valid


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

        # Attention state tracking
        self.since = {}  # Track when behaviors started
        self.cooldowns = {}  # Cooldown periods between events
        self.frame_history = deque(maxlen=10)  # Last 10 frames for trend analysis

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
                'confidence': 0.85,  # Base confidence for Haar cascade
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

        # Sort eyes by y position (top, bottom)
        eyes_sorted = sorted(eyes, key=lambda e: e[1])

        # Calculate eye centers
        eye_centers = []
        for (ex, ey, ew, eh) in eyes_sorted[:2]:
            eye_centers.append((ex + ew/2, ey + eh/2))

        if len(eye_centers) < 2:
            return {'direction': 'center', 'confidence': 0.3}

        # Calculate angle between eyes (should be ~0 for frontal face)
        eye_angle = np.degrees(np.arctan2(
            eye_centers[1][1] - eye_centers[0][1],
            eye_centers[1][0] - eye_centers[0][0]
        ))

        # Calculate horizontal offset (gaze direction)
        left_eye_center = eye_centers[0]
        right_eye_center = eye_centers[1]

        face_center_x = face_size[0] / 2
        left_offset = left_eye_center[0] - face_center_x
        right_offset = right_eye_center[0] - face_center_x

        # Determine gaze direction
        if abs(left_offset) < face_size[0] * 0.15 and abs(right_offset) < face_size[0] * 0.15:
            direction = 'forward'
            confidence = 0.7
        elif left_offset < -face_size[0] * 0.2:
            direction = 'left'
            confidence = 0.6
        elif right_offset < -face_size[0] * 0.2:
            direction = 'right'
            confidence = 0.6
        elif left_offset > face_size[0] * 0.2 or right_offset > face_size[0] * 0.2:
            direction = 'away'  # Looking away from camera
            confidence = 0.65
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

        # Map gaze to attention state
        if direction == 'forward':
            return {'state': 'facing_screen', 'score': 0.9}
        elif direction in ('left', 'right'):
            return {'state': 'looking_away', 'score': 0.7}
        elif direction == 'away':
            return {'state': 'not_facing_camera', 'score': 0.8}
        else:
            return {'state': 'uncertain', 'score': 0.4}

    def update(self, detections):
        """Update attention state with new detections and return suspicious behaviors."""
        now = time.monotonic()
        suspicious = []

        # Track frame history
        self.frame_history.append({
            'time': now,
            'detections': detections,
            'has_face': len(detections) > 0
        })

        if not detections:
            # No face detected - possible looking away or blocked camera
            if len(self.frame_history) >= 3:
                recent = [f for f in self.frame_history[-3:] if not f['has_face']]
                if len(recent) >= 2:
                    suspicious.append({
                        'category': 'no_face_detected',
                        'detail': {'duration': round(now - recent[0]['time'], 1)},
                        'severity': 'medium'
                    })
                    self.since['no_face_detected'] = now
            return suspicious

        # Analyze first detected face
        face = detections[0]
        gaze = face.get('gaze_direction', {})
        attention = face.get('attention_state', {})

        # Check for looking away
        if attention.get('state') == 'looking_away':
            if 'looking_away' not in self.since:
                self.since['looking_away'] = now
            elif now - self.since['looking_away'] >= 1.0:  # 1 second threshold
                suspicious.append({
                    'category': 'looking_away',
                    'detail': {
                        'direction': gaze.get('direction', 'unknown'),
                        'duration': round(now - self.since['looking_away'], 1)
                    },
                    'severity': 'medium'
                })

        # Check for not facing camera
        if attention.get('state') == 'not_facing_camera':
            if 'not_facing_camera' not in self.since:
                self.since['not_facing_camera'] = now
            elif now - self.since['not_facing_camera'] >= 1.5:
                suspicious.append({
                    'category': 'not_facing_camera',
                    'detail': {
                        'duration': round(now - self.since['not_facing_camera'], 1)
                    },
                    'severity': 'high'
                })

        # Check for screen switching (side glances)
        if gaze.get('direction') in ('left', 'right'):
            if 'side_glance' not in self.since:
                self.since['side_glance'] = now
            elif now - self.since['side_glance'] >= 0.5:  # Shorter threshold for glances
                suspicious.append({
                    'category': 'side_glance',
                    'detail': {
                        'direction': gaze.get('direction'),
                        'frequency': 'repeated'
                    },
                    'severity': 'low'
                })
                self.since['side_glance'] = now  # Reset for repeated detection

        return suspicious


class AttentionMonitor:
    """Monitors student attention and detects cheating behaviors."""

    def __init__(self, event_callback, snapshot_callback, cooldowns=None):
        self.event_callback = event_callback  # Send events to server
        self.snapshot_callback = snapshot_callback  # Take snapshot on suspicion
        self.detector = FaceAttentionDetector()
        self.suspended = False
        self.session_id = None
        self.enabled = False
        self.last_event_time = {}
        self.cooldowns = cooldowns or {
            'looking_away': 3.0,
            'side_glance': 2.0,
            'not_facing_camera': 5.0,
            'no_face_detected': 3.0
        }

        # Snapshot buffer for recent frames
        self.snapshot_buffer = deque(maxlen=5)
        self.last_snapshot_time = 0

    def start(self, session_id):
        """Start attention monitoring for a session."""
        self.session_id = session_id
        self.enabled = True
        self.suspended = False
        self.last_event_time = {}
        self.detector = FaceAttentionDetector()  # Reset detector

    def stop(self):
        """Stop attention monitoring."""
        self.enabled = False
        self.session_id = None
        self.suspended = True

    def process_frame(self, frame, jpeg_bytes=None):
        """Process a webcam frame and detect suspicious behaviors."""
        if not self.enabled or self.suspended:
            return

        # Detect faces and analyze attention
        detections = self.detector.detect_faces(frame)
        suspicious = self.detector.update(detections)

        # Buffer frames for snapshots
        if jpeg_bytes is not None:
            self.snapshot_buffer.append({
                'frame': frame.copy(),
                'jpeg': jpeg_bytes,
                'time': time.monotonic()
            })

        # Process suspicious behaviors
        for event in suspicious:
            category = event['category']
            now = time.monotonic()

            # Check cooldown
            if category in self.last_event_time:
                cooldown = self.cooldowns.get(category, 3.0)
                if now - self.last_event_time[category] < cooldown:
                    continue

            self.last_event_time[category] = now

            # Send event to server
            payload = {
                'sessionId': self.session_id,
                'category': f'attention_{category}',
                'clientEventId': str(uuid.uuid4()),
                'detail': event['detail'],
                'severity': event['severity'],
                'observedAt': datetime.fromtimestamp(
                    time.time(), timezone.utc
                ).isoformat(timespec='milliseconds')
            }

            self.event_callback(payload)

            # Take snapshot for evidence (if not already taken recently)
            if now - self.last_snapshot_time >= 2.0:
                self._capture_snapshot(event)

    def _capture_snapshot(self, event):
        """Capture and send snapshot for suspicious behavior evidence."""
        self.last_snapshot_time = time.monotonic()

        # Get most recent frame from buffer
        if self.snapshot_buffer:
            recent = self.snapshot_buffer[-1]
            snapshot_data = {
                'snapshot': recent['jpeg'],
                'category': event['category'],
                'severity': event['severity'],
                'timestamp': datetime.fromtimestamp(
                    time.time(), timezone.utc
                ).isoformat(timespec='milliseconds'),
                'detail': event['detail']
            }

            # Trigger snapshot callback
            if self.snapshot_callback:
                self.snapshot_callback(snapshot_data)

    def suspend(self):
        """Temporarily suspend monitoring (e.g., during exam hold)."""
        self.suspended = True

    def resume(self):
        """Resume monitoring after suspension."""
        self.suspended = False

    def is_monitoring(self):
        """Check if attention monitoring is active."""
        return self.enabled and not self.suspended
