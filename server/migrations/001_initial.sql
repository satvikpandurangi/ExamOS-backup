CREATE TABLE IF NOT EXISTS teachers(id uuid PRIMARY KEY,email text UNIQUE NOT NULL,password_hash text NOT NULL);
CREATE TABLE IF NOT EXISTS devices(id uuid PRIMARY KEY,teacher_id uuid NOT NULL REFERENCES teachers(id),name text NOT NULL,token_hash text UNIQUE NOT NULL,revoked boolean NOT NULL DEFAULT false);
CREATE TABLE IF NOT EXISTS enrollments(code_hash text PRIMARY KEY,teacher_id uuid NOT NULL REFERENCES teachers(id),expires_at timestamptz NOT NULL);
CREATE TABLE IF NOT EXISTS sessions(id uuid PRIMARY KEY,teacher_id uuid NOT NULL REFERENCES teachers(id),name text NOT NULL,allowed_apps jsonb NOT NULL DEFAULT '[]',status text NOT NULL CHECK(status IN ('active','ended')),started_at timestamptz NOT NULL DEFAULT now(),ended_at timestamptz);
CREATE UNIQUE INDEX IF NOT EXISTS one_active_session ON sessions(teacher_id) WHERE status='active';
CREATE TABLE IF NOT EXISTS events(id uuid PRIMARY KEY,teacher_id uuid NOT NULL REFERENCES teachers(id),session_id uuid NOT NULL REFERENCES sessions(id),device_id uuid REFERENCES devices(id),kind text NOT NULL,detail jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),review text,reviewed_at timestamptz);
CREATE INDEX IF NOT EXISTS events_session_time ON events(session_id,created_at);
