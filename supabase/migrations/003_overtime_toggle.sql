-- ============================================================
-- Overtime feature toggle: allow companies to disable overtime
-- Default TRUE so all existing companies are unaffected.
-- ============================================================

ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS overtime_enabled BOOLEAN NOT NULL DEFAULT TRUE;
