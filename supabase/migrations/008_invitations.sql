-- ============================================================
-- 008: invitations — admin invites an email into their company
-- ============================================================
-- Used by "Masuk dengan Google" (SSO). An invited person who signs in with
-- Google using exactly this email gets a profile in the inviting company
-- (POST /auth/sso/session). SSO never creates accounts without an invitation.
--
-- Access: backend only (service_role). RLS ON with no policies = default deny
-- for anon/authenticated, same as every other public table (see 006).
--
-- How to apply: Supabase Dashboard → SQL Editor → paste & run,
-- BEFORE deploying the backend. Safe to run more than once.
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.invitations (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  email        text NOT NULL CHECK (email = lower(email)),
  role         text NOT NULL DEFAULT 'employee' CHECK (role IN ('employee', 'admin')),
  position     text,
  status       text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'revoked')),
  invited_by   uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  accepted_by  uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  accepted_at  timestamptz,
  expires_at   timestamptz NOT NULL DEFAULT (now() + interval '30 days'),
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- One open invitation per email across ALL companies: on Google sign-in the
-- email alone must decide which company the person joins.
CREATE UNIQUE INDEX IF NOT EXISTS uq_invitations_pending_email
  ON public.invitations (email) WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_invitations_company_created
  ON public.invitations (company_id, created_at DESC);

ALTER TABLE public.invitations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.invitations FROM anon, authenticated;

COMMIT;
