CREATE TABLE evidence_assets(
 id uuid PRIMARY KEY,
 event_id uuid NOT NULL REFERENCES proctor_events(id),
 teacher_id uuid NOT NULL REFERENCES teachers(id),
 student_id uuid NOT NULL REFERENCES devices(id),
 session_id uuid NOT NULL REFERENCES sessions(id),
 examination_id uuid REFERENCES exam_attempts(id),
 kind text NOT NULL CHECK(kind IN ('snapshot','clip')),
 mime_type text NOT NULL,
 storage_location text NOT NULL,
 captured_at timestamptz NOT NULL,
 capture_time_source text NOT NULL DEFAULT 'capture' CHECK(capture_time_source IN ('capture','detection')),
 byte_size integer NOT NULL CHECK(byte_size>0),
 expires_at timestamptz NOT NULL,
 status text NOT NULL DEFAULT 'available' CHECK(status IN ('available','deleted','expired')),
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(event_id,kind),
 CHECK((kind='snapshot' AND mime_type='image/jpeg') OR (kind='clip' AND mime_type='video/webm'))
);
CREATE INDEX evidence_assets_owner_time ON evidence_assets(teacher_id,captured_at DESC);
INSERT INTO evidence_assets(id,event_id,teacher_id,student_id,session_id,examination_id,kind,mime_type,storage_location,captured_at,capture_time_source,byte_size,expires_at)
 SELECT gen_random_uuid(),id,teacher_id,device_id,session_id,attempt_id,'snapshot','image/jpeg','postgresql:proctor_events/'||id||'/evidence',observed_at,'detection',octet_length(evidence),evidence_expires_at FROM proctor_events WHERE evidence IS NOT NULL;
INSERT INTO evidence_assets(id,event_id,teacher_id,student_id,session_id,examination_id,kind,mime_type,storage_location,captured_at,byte_size,expires_at)
 SELECT gen_random_uuid(),id,teacher_id,device_id,session_id,attempt_id,'clip','video/webm','postgresql:proctor_events/'||id||'/clip',COALESCE((clip_metadata->>'startedAt')::timestamptz,observed_at),octet_length(clip),evidence_expires_at FROM proctor_events WHERE clip IS NOT NULL;
CREATE TABLE camera_check_requests(
 id uuid PRIMARY KEY,
 teacher_id uuid NOT NULL REFERENCES teachers(id),
 device_id uuid NOT NULL REFERENCES devices(id),
 session_id uuid NOT NULL REFERENCES sessions(id),
 event_id uuid REFERENCES proctor_events(id),
 status text NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','captured','failed','expired')),
 error text,
 requested_at timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz NOT NULL DEFAULT now()+interval '30 seconds'
);
CREATE INDEX camera_checks_owner_device ON camera_check_requests(teacher_id,device_id,requested_at DESC);
