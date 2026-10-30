ALTER TABLE exam_attempts ADD COLUMN answer_revision integer NOT NULL DEFAULT 0;
ALTER TABLE exam_attempts ADD COLUMN last_mutation_id uuid;
