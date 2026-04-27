-- ============================================================
-- Additional performance indexes
-- Run this in Supabase SQL editor after schema.sql
-- ============================================================

-- Admin leave list orders by created_at DESC — the existing idx_leave_company_status
-- only covers (company_id, status) but not the sort key.
CREATE INDEX IF NOT EXISTS idx_leave_company_created
  ON leave_requests(company_id, created_at DESC);

-- Admin overtime list orders by created_at DESC — idx_overtime_company covers
-- (company_id, date DESC) which doesn't help created_at ordering.
CREATE INDEX IF NOT EXISTS idx_overtime_company_created
  ON overtime_requests(company_id, created_at DESC);

-- Admin stats: profiles WHERE company_id = ? AND is_active = true
CREATE INDEX IF NOT EXISTS idx_profiles_company_active
  ON profiles(company_id, is_active);

-- Attendance export: date range filter per company
CREATE INDEX IF NOT EXISTS idx_attendance_company_date_range
  ON attendance(company_id, date ASC);
