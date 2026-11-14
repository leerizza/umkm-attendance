-- ============================================================
-- 006: Lock down direct table access for anon / authenticated
-- Audit Nov 2026
-- ============================================================
-- Context
--   All table access goes through the FastAPI backend using the service_role
--   key (bypasses RLS). Frontend (app + demo) uses Supabase only for Auth and
--   the `sick-notes` Storage bucket; admin panel does not use Supabase at all.
--
-- Problem (verified on production 2026-11-14 via pg_policies)
--   Policies below let any logged-in user call PostgREST directly with their own
--   JWT + the public anon key, skipping all backend validation:
--   - profiles_update_own (+ UPDATE grant on profiles.role) → employee can set
--     own role = 'admin' (privilege escalation; backend trusts profiles.role)
--   - attendance_insert / attendance_update_own → fake clock-in, no GPS check
--   - leave_update / overtime_update → approve own requests
--
-- Fix
--   Drop every policy on public tables (RLS stays ON → default deny) and revoke
--   table privileges from anon/authenticated. service_role is unaffected.
--   Storage policies (storage.objects, sick-notes) are NOT touched.
--
-- How to apply: Supabase Dashboard → SQL Editor → paste & run.
-- Rollback:     006_lockdown_public_rls.rollback.sql
-- ============================================================

BEGIN;

-- companies
DROP POLICY IF EXISTS "company_read"              ON public.companies;
-- profiles
DROP POLICY IF EXISTS "profiles_read"             ON public.profiles;
DROP POLICY IF EXISTS "profiles_update_own"       ON public.profiles;
-- attendance
DROP POLICY IF EXISTS "attendance_employee_read"  ON public.attendance;
DROP POLICY IF EXISTS "attendance_insert"         ON public.attendance;
DROP POLICY IF EXISTS "attendance_update_own"     ON public.attendance;
-- leave_requests
DROP POLICY IF EXISTS "leave_read"                ON public.leave_requests;
DROP POLICY IF EXISTS "leave_insert"              ON public.leave_requests;
DROP POLICY IF EXISTS "leave_update"              ON public.leave_requests;
-- overtime_requests
DROP POLICY IF EXISTS "overtime_read"             ON public.overtime_requests;
DROP POLICY IF EXISTS "overtime_insert"           ON public.overtime_requests;
DROP POLICY IF EXISTS "overtime_update"           ON public.overtime_requests;
-- locations / employee_locations
DROP POLICY IF EXISTS "locations_read"            ON public.locations;
DROP POLICY IF EXISTS "locations_write"           ON public.locations;
DROP POLICY IF EXISTS "employee_locations_read"   ON public.employee_locations;
DROP POLICY IF EXISTS "employee_locations_write"  ON public.employee_locations;

-- Defense in depth: even if a permissive policy is added later by mistake,
-- anon/authenticated have no table privileges in public.
REVOKE ALL ON ALL TABLES    IN SCHEMA public FROM anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;

-- New tables created from the SQL editor / dashboard (owner: postgres) won't
-- be auto-granted to anon/authenticated either. If a future feature really
-- needs direct supabase-js table access, GRANT explicitly + write a policy.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON TABLES    FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON SEQUENCES FROM anon, authenticated;

COMMIT;

-- ============================================================
-- Verify (expected: 0 rows for the first query, RLS ON for every table,
-- and 0 rows for the grant query)
-- ============================================================
-- select tablename, policyname from pg_policies where schemaname = 'public';
-- select relname, relrowsecurity from pg_class
--   where relnamespace = 'public'::regnamespace and relkind = 'r';
-- select table_name, grantee, privilege_type from information_schema.role_table_grants
--   where table_schema = 'public' and grantee in ('anon','authenticated');
