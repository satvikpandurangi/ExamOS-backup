-- Migration 010: Suspicious behavior tracking and admin controls
-- Adds tables for tracking student attention/gaze anomalies and admin freeze/end actions

CREATE TABLE IF NOT EXISTS suspicious_behavior_events (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id uuid NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    device_id uuid NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
    attempt_id uuid REFERENCES exam_attempts(id) ON DELETE CASCADE,
    category text NOT NULL, -- looking_away, side_glance, not_facing_camera, no_face_detected
    severity text NOT NULL, -- low, medium, high
    detail jsonb NOT NULL DEFAULT '{}',
    snapshot_id uuid REFERENCES evidence_assets(id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    teacher_reviewed boolean NOT NULL DEFAULT false,
    teacher_review text,
    teacher_reviewed_at timestamptz,
    teacher_reviewed_by uuid REFERENCES teachers(id) ON DELETE SET NULL,
    action_taken text, -- ignored, frozen, ended
    action_taken_at timestamptz,
    action_taken_by uuid REFERENCES teachers(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_suspicious_behavior_session ON suspicious_behavior_events(session_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_suspicious_behavior_device ON suspicious_behavior_events(device_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_suspicious_behavior_attempt ON suspicious_behavior_events(attempt_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_suspicious_behavior_unreviewed ON suspicious_behavior_events(teacher_reviewed, created_at DESC) WHERE teacher_reviewed = false;

-- Add freeze support to exam_attempts
ALTER TABLE exam_attempts ADD COLUMN IF NOT EXISTS frozen_at timestamptz;
ALTER TABLE exam_attempts ADD COLUMN IF NOT EXISTS freeze_reason text;
ALTER TABLE exam_attempts ADD COLUMN IF NOT EXISTS frozen_by uuid REFERENCES teachers(id) ON DELETE SET NULL;

-- Add index for frozen attempts
CREATE INDEX IF NOT EXISTS idx_exam_attempts_frozen ON exam_attempts(frozen_at) WHERE frozen_at IS NOT NULL;