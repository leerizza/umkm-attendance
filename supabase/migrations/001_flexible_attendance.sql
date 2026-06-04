-- ============================================================
-- Flexible attendance: break sessions + minimum work duration
-- ============================================================

-- Companies: opt-in flexible attendance mode + minimum work duration
ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS flexible_attendance BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS min_work_minutes INT NOT NULL DEFAULT 480;

-- Attendance: add a single break window (break_start = mulai istirahat,
-- break_end = selesai istirahat). NULL means "no break taken yet/today".
ALTER TABLE attendance
  ADD COLUMN IF NOT EXISTS break_start TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS break_end   TIMESTAMPTZ;
