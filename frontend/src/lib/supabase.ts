import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn("Supabase env vars missing — check .env");
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    storageKey: "umkm_auth",
    autoRefreshToken: true,
    // PKCE for OAuth/SSO redirects: the callback URL carries a one-time code
    // (useless without the verifier kept in this browser) instead of the
    // access/refresh tokens themselves.
    flowType: "pkce",
  },
});
