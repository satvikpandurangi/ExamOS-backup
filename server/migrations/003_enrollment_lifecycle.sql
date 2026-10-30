ALTER TABLE enrollments ADD COLUMN created_at timestamptz NOT NULL DEFAULT now();
UPDATE enrollments SET created_at=expires_at-interval '5 minutes';
ALTER TABLE enrollments ADD COLUMN used_at timestamptz;
