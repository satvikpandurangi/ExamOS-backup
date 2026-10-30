-- Migration 010: Suspicious behavior tracking and admin controls
-- Adds tables for tracking student attention/gaze anomalies and admin freeze/end actions

CREATE TABLE IF NOT EXISTS suspicious_behavior_events (
    id SERIAL PRIMARY KEY,
    session_id INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    device_id INTEGER NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
    attempt_id INTEGER REFERENCES exam_attempts(id) ON DELETE CASCADE,
    category VARCHAR(50) NOT NULL, -- looking_away, side_glance, not_facing_camera, no_face_detected
    severity VARCHAR(20) NOT NULL, -- low, medium, high
    detail JSONB NOT NULL DEFAULT '{}',
    snapshot_id INTEGER REFERENCES evidence_catalog(id) ON DELETE SET NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    teacher_reviewed BOOLEAN NOT NULL DEFAULT FALSE,
    teacher_review VARCHAR(2000),
    teacher_reviewed_at TIMESTAMP,
    teacher_reviewed_by INTEGER REFERENCES teachers(id) ON DELETE SET NULL,
    action_taken VARCHAR(50), -- ignored, frozen, ended
    action_taken_at TIMESTAMP,
    action_taken_by INTEGER REFERENCES teachers(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_suspicious_behavior_session ON suspicious_behavior_events(session_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_suspicious_behavior_device ON suspicious_behavior_events(device_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_suspicious_behavior_attempt ON suspicious_behavior_events(attempt_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_suspicious_behavior_unreviewed ON suspicious_behavior_events(teacher_reviewed, created_at DESC) WHERE teacher_reviewed = FALSE;

-- Add freeze support to exam_attempts
ALTER TABLE exam_attempts ADD COLUMN IF NOT EXISTS frozen_at TIMESTAMP;
ALTER TABLE exam_attempts ADD COLUMN IF NOT EXISTS freeze_reason VARCHAR(2000);
ALTER TABLE exam_attempts ADD COLUMN IF NOT EXISTS frozen_by INTEGER REFERENCES teachers(id) ON DELETE SET NULL;

-- Add index for frozen attempts
CREATE INDEX IF NOT EXISTS idx_exam_attempts_frozen ON exam_attempts(frozen_at) WHERE frozen_at IS NOT NULL;

-- Extend exam_controls ledger to include freeze action
-- (The existing exam_controls table already supports pause/resume/end; freeze is a new action type)