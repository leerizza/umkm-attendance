-- 007: audit_log — who did it, in which company, and what changed.
-- Used for employee role changes and activate/deactivate (audit Nov 2026).
-- Run in Supabase SQL Editor BEFORE deploying the backend change.
-- (Safe to run more than once.)
ALTER TABLE public.audit_log ADD COLUMN IF NOT EXISTS actor_id uuid;
ALTER TABLE public.audit_log ADD COLUMN IF NOT EXISTS actor_name text;
ALTER TABLE public.audit_log ADD COLUMN IF NOT EXISTS company_id uuid;
ALTER TABLE public.audit_log ADD COLUMN IF NOT EXISTS details jsonb;
CREATE INDEX IF NOT EXISTS idx_audit_log_company_created ON public.audit_log (company_id, created_at DESC);
