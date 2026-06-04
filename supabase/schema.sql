-- ============================================================
-- UMKM Attendance System - Supabase Schema
-- ============================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- COMPANIES (Multi-tenant)
-- ============================================================
CREATE TABLE companies (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  code TEXT UNIQUE NOT NULL, -- unique join code e.g. "BFI2024"
  address TEXT,
  lat DOUBLE PRECISION,       -- office GPS latitude
  lng DOUBLE PRECISION,       -- office GPS longitude
  radius_meters INT DEFAULT 100, -- allowed clock-in radius
  work_start TIME DEFAULT '08:00',
  work_end   TIME DEFAULT '17:00',
  flexible_attendance BOOLEAN NOT NULL DEFAULT FALSE, -- enables break sessions + duration-based status
  min_work_minutes INT NOT NULL DEFAULT 480,          -- threshold (in minutes) of effective work time to count as "present"
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- PROFILES (extends Supabase auth.users)
-- ============================================================
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  company_id UUID REFERENCES companies(id),
  full_name TEXT NOT NULL,
  phone TEXT,
  role TEXT NOT NULL DEFAULT 'employee' CHECK (role IN ('employee','admin','superadmin')),
  position TEXT,
  avatar_url TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- ATTENDANCE
-- ============================================================
CREATE TABLE attendance (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES companies(id),
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  clock_in TIMESTAMPTZ,
  clock_out TIMESTAMPTZ,
  break_start TIMESTAMPTZ, -- flexible mode: mulai istirahat
  break_end   TIMESTAMPTZ, -- flexible mode: selesai istirahat
  clock_in_lat DOUBLE PRECISION,
  clock_in_lng DOUBLE PRECISION,
  clock_out_lat DOUBLE PRECISION,
  clock_out_lng DOUBLE PRECISION,
  clock_in_distance_m INT,   -- distance from office at clock-in
  clock_out_distance_m INT,
  status TEXT DEFAULT 'present' CHECK (status IN ('present','late','early_leave','absent')),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, date)      -- prevent double clock-in per day
);

-- ============================================================
-- LEAVE REQUESTS
-- ============================================================
CREATE TABLE leave_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES companies(id),
  leave_type TEXT NOT NULL CHECK (leave_type IN ('annual','sick','personal','other')),
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  days_count INT GENERATED ALWAYS AS (end_date - start_date + 1) STORED,
  reason TEXT NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  reviewed_by UUID REFERENCES profiles(id),
  reviewed_at TIMESTAMPTZ,
  reviewer_note TEXT,
  attachment_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- OVERTIME REQUESTS
-- ============================================================
CREATE TABLE overtime_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES companies(id),
  date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  duration_minutes INT GENERATED ALWAYS AS (
    CAST(EXTRACT(EPOCH FROM (end_time - start_time)) / 60 AS INT)
  ) STORED,
  reason TEXT NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  reviewed_by UUID REFERENCES profiles(id),
  reviewed_at TIMESTAMPTZ,
  reviewer_note TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- INDEXES (Performance critical)
-- ============================================================
CREATE INDEX idx_attendance_user_date   ON attendance(user_id, date DESC);
CREATE INDEX idx_attendance_company     ON attendance(company_id, date DESC);
CREATE INDEX idx_leave_user_status      ON leave_requests(user_id, status);
CREATE INDEX idx_leave_company_status   ON leave_requests(company_id, status);
CREATE INDEX idx_overtime_user_status   ON overtime_requests(user_id, status);
CREATE INDEX idx_overtime_company       ON overtime_requests(company_id, date DESC);
CREATE INDEX idx_profiles_company       ON profiles(company_id);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================
ALTER TABLE companies         ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles          ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance        ENABLE ROW LEVEL SECURITY;
ALTER TABLE leave_requests    ENABLE ROW LEVEL SECURITY;
ALTER TABLE overtime_requests ENABLE ROW LEVEL SECURITY;

-- Helper: get current user's role and company
CREATE OR REPLACE FUNCTION get_my_role() RETURNS TEXT AS $$
  SELECT role FROM profiles WHERE id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION get_my_company() RETURNS UUID AS $$
  SELECT company_id FROM profiles WHERE id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Companies: only members can read their own company
CREATE POLICY "company_read" ON companies
  FOR SELECT USING (id = get_my_company());

-- Profiles: users see only their company
CREATE POLICY "profiles_read" ON profiles
  FOR SELECT USING (company_id = get_my_company());

CREATE POLICY "profiles_update_own" ON profiles
  FOR UPDATE USING (id = auth.uid());

-- Attendance: employees see own, admins see all in company
CREATE POLICY "attendance_employee_read" ON attendance
  FOR SELECT USING (
    user_id = auth.uid()
    OR (company_id = get_my_company() AND get_my_role() IN ('admin','superadmin'))
  );

CREATE POLICY "attendance_insert" ON attendance
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "attendance_update_own" ON attendance
  FOR UPDATE USING (user_id = auth.uid());

-- Leave
CREATE POLICY "leave_read" ON leave_requests
  FOR SELECT USING (
    user_id = auth.uid()
    OR (company_id = get_my_company() AND get_my_role() IN ('admin','superadmin'))
  );

CREATE POLICY "leave_insert" ON leave_requests
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "leave_update" ON leave_requests
  FOR UPDATE USING (
    user_id = auth.uid()
    OR (company_id = get_my_company() AND get_my_role() IN ('admin','superadmin'))
  );

-- Overtime
CREATE POLICY "overtime_read" ON overtime_requests
  FOR SELECT USING (
    user_id = auth.uid()
    OR (company_id = get_my_company() AND get_my_role() IN ('admin','superadmin'))
  );

CREATE POLICY "overtime_insert" ON overtime_requests
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "overtime_update" ON overtime_requests
  FOR UPDATE USING (
    user_id = auth.uid()
    OR (company_id = get_my_company() AND get_my_role() IN ('admin','superadmin'))
  );

-- ============================================================
-- TRIGGERS: auto-update updated_at
-- ============================================================
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_leave_updated_at
  BEFORE UPDATE ON leave_requests
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_overtime_updated_at
  BEFORE UPDATE ON overtime_requests
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================
-- SEED: Sample company (for testing)
-- ============================================================
INSERT INTO companies (name, code, address, lat, lng, radius_meters)
VALUES (
  'Demo Company UMKM',
  'DEMO2024',
  'Jl. Sudirman No.1, Jakarta',
  -6.2088,
  106.8456,
  150
);
