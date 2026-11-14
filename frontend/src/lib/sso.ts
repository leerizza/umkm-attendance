import { IS_DEMO } from "@/lib/demo";

// "Masuk dengan Google" + admin invitations. Off until the Google provider and
// the /auth/callback redirect URL are set up in Supabase (see .env.example).
export const SSO_GOOGLE_ENABLED = import.meta.env.VITE_SSO_GOOGLE === "true" && !IS_DEMO;
