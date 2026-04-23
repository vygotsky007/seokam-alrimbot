-- alrim_entries 테이블에 설정/서명 컬럼 추가
ALTER TABLE alrim_entries
  ADD COLUMN IF NOT EXISTS settings  JSONB,
  ADD COLUMN IF NOT EXISTS signature TEXT;
