-- ============================================================
-- Multi-location attendance: multiple office points + per-employee assignment
-- Opt-in via companies.multi_location toggle. When OFF, system uses legacy
-- single-point (companies.lat/lng/radius_meters) and ignores these tables.
-- ============================================================

-- Toggle on companies
ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS multi_location BOOLEAN NOT NULL DEFAULT FALSE;

-- ─── locations: multiple office points per company ──────────────────────────
CREATE TABLE IF NOT EXISTS locations (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id    UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,                                     -- e.g. "Cabang Jakarta"
  address       TEXT,
  lat           DOUBLE PRECISION NOT NULL,
  lng           DOUBLE PRECISION NOT NULL,
  radius_meters INT NOT NULL DEFAULT 100,
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (company_id, name)
);

CREATE INDEX IF NOT EXISTS idx_locations_company  ON locations(company_id, is_active);

-- ─── employee_locations: which locations each employee is allowed to use ────
CREATE TABLE IF NOT EXISTS employee_locations (
  user_id     UUID NOT NULL REFERENCES profiles(id)  ON DELETE CASCADE,
  location_id UUID NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, location_id)
);

CREATE INDEX IF NOT EXISTS idx_employee_locations_user     ON employee_locations(user_id);
CREATE INDEX IF NOT EXISTS idx_employee_locations_location ON employee_locations(location_id);

-- ─── attendance: track which location was used for this record ──────────────
ALTER TABLE attendance
  ADD COLUMN IF NOT EXISTS location_id UUID REFERENCES locations(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_attendance_location ON attendance(location_id);

-- ─── RLS ────────────────────────────────────────────────────────────────────
ALTER TABLE locations          ENABLE ROW LEVEL SECURITY;
ALTER TABLE employee_locations ENABLE ROW LEVEL SECURITY;

-- Locations: anyone in the company can read; only admins write
DROP POLICY IF EXISTS "locations_read"   ON locations;
DROP POLICY IF EXISTS "locations_write"  ON locations;
CREATE POLICY "locations_read"  ON locations FOR SELECT USING (company_id = get_my_company());
CREATE POLICY "locations_write" ON locations FOR ALL    USING (
  company_id = get_my_company() AND get_my_role() IN ('admin','superadmin')
);

-- employee_locations: user sees own; admins of the same company see/manage all
DROP POLICY IF EXISTS "employee_locations_read"  ON employee_locations;
DROP POLICY IF EXISTS "employee_locations_write" ON employee_locations;
CREATE POLICY "employee_locations_read"  ON employee_locations FOR SELECT USING (
  user_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = employee_locations.user_id
      AND p.company_id = get_my_company()
      AND get_my_role() IN ('admin','superadmin')
  )
);
CREATE POLICY "employee_locations_write" ON employee_locations FOR ALL USING (
  EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = employee_locations.user_id
      AND p.company_id = get_my_company()
      AND get_my_role() IN ('admin','superadmin')
  )
);
