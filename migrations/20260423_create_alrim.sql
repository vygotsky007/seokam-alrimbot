CREATE TABLE alrim_entries (
  id BIGSERIAL PRIMARY KEY,
  teacher_name TEXT,
  class_name TEXT,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  topics JSONB,  -- [{subject, keywords}]
  generated_text TEXT NOT NULL,
  edited_text TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_alrim_date ON alrim_entries(date DESC);
CREATE INDEX idx_alrim_teacher ON alrim_entries(teacher_name);

ALTER TABLE alrim_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow all" ON alrim_entries FOR ALL USING (true) WITH CHECK (true);
