-- ============================================================
-- ROLLBACK for 006_lockdown_public_rls.sql
-- Restores the exact production state captured on 2026-11-14 (pg_policies).
-- WARNING: this re-opens the privilege-escalation / fake-attendance holes.
-- Use only if something unexpectedly depended on direct table access.
-- ============================================================

BEGIN;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT ALL ON TABLES    TO anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT ALL ON SEQUENCES TO anon, authenticated;
GRANT ALL ON ALL TABLES    IN SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated;

CREATE POLICY "company_read" ON public.companies
  FOR SELECT USING (id = get_my_company());

CREATE POLICY "profiles_read" ON public.profiles
  FOR SELECT USING (company_id = get_my_company());
CREATE POLICY "profiles_update_own" ON public.profiles
  FOR UPDATE USING (id = auth.uid());

CREATE POLICY "attendance_employee_read" ON public.attendance
  FOR SELECT USING (user_id = auth.uid()
    OR (company_id = get_my_company() AND get_my_role() IN ('admin','superadmin')));
CREATE POLICY "attendance_insert" ON public.attendance
  FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "attendance_update_own" ON public.attendance
  FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY "leave_read" ON public.leave_requests
  FOR SELECT USING (user_id = auth.uid()
    OR (company_id = get_my_company() AND get_my_role() IN ('admin','superadmin')));
CREATE POLICY "leave_insert" ON public.leave_requests
  FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "leave_update" ON public.leave_requests
  FOR UPDATE USING (user_id = auth.uid()
    OR (company_id = get_my_company() AND get_my_role() IN ('admin','superadmin')));

CREATE POLICY "overtime_read" ON public.overtime_requests
  FOR SELECT USING (user_id = auth.uid()
    OR (company_id = get_my_company() AND get_my_role() IN ('admin','superadmin')));
CREATE POLICY "overtime_insert" ON public.overtime_requests
  FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "overtime_update" ON public.overtime_requests
  FOR UPDATE USING (user_id = auth.uid()
    OR (company_id = get_my_company() AND get_my_role() IN ('admin','superadmin')));

CREATE POLICY "locations_read" ON public.locations
  FOR SELECT USING (company_id = get_my_company());
CREATE POLICY "locations_write" ON public.locations
  FOR ALL USING (company_id = get_my_company() AND get_my_role() IN ('admin','superadmin'));

CREATE POLICY "employee_locations_read" ON public.employee_locations
  FOR SELECT USING (user_id = auth.uid() OR EXISTS (
    SELECT 1 FROM profiles p WHERE p.id = employee_locations.user_id
      AND p.company_id = get_my_company() AND get_my_role() IN ('admin','superadmin')));
CREATE POLICY "employee_locations_write" ON public.employee_locations
  FOR ALL USING (EXISTS (
    SELECT 1 FROM profiles p WHERE p.id = employee_locations.user_id
      AND p.company_id = get_my_company() AND get_my_role() IN ('admin','superadmin')));

COMMIT;
