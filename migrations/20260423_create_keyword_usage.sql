CREATE TABLE alrim_keyword_usage (
  id BIGSERIAL PRIMARY KEY,
  keyword TEXT NOT NULL,
  used_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_keyword_used_at ON alrim_keyword_usage(used_at DESC);
CREATE INDEX idx_keyword ON alrim_keyword_usage(keyword);

ALTER TABLE alrim_keyword_usage ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow all" ON alrim_keyword_usage FOR ALL USING (true) WITH CHECK (true);
