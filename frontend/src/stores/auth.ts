import { create } from "zustand";
import { persist } from "zustand/middleware";
import { supabase } from "@/lib/supabase";

export interface UserProfile {
  id: string;
  full_name: string;
  email: string;
  role: "employee" | "admin";
  position?: string;
  phone?: string;
  avatar_url?: string;
  company_id: string;
  companies?: {
    id: string;
    name: string;
    code: string;
    lat?: number;
    lng?: number;
    radius_meters: number;
    work_start: string;
    work_end: string;
    work_saturday?: boolean;
    work_sunday?: boolean;
    flexible_attendance?: boolean;
    min_work_minutes?: number;
    multi_location?: boolean;
    overtime_enabled?: boolean;
  };
}

interface AuthState {
  token: string | null;
  profile: UserProfile | null;
  isAuthenticated: boolean;
  setAuth: (token: string, profile: UserProfile) => void;
  setProfile: (profile: UserProfile) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      profile: null,
      isAuthenticated: false,

      setAuth: (token, profile) =>
        set({ token, profile, isAuthenticated: true }),

      setProfile: (profile) => set({ profile }),

      logout: () => {
        supabase.auth.signOut();
        set({ token: null, profile: null, isAuthenticated: false });
      },
    }),
    {
      name: "umkm_auth_store",
      partialize: (s) => ({ token: s.token, profile: s.profile, isAuthenticated: s.isAuthenticated }),
    }
  )
);

supabase.auth.onAuthStateChange((event, session) => {
  const store = useAuthStore.getState();
  if (event === "TOKEN_REFRESHED" && session) {
    if (store.isAuthenticated && store.profile) {
      store.setAuth(session.access_token, store.profile);
    }
  }
  // Supabase fires SIGNED_OUT when refresh token expires or is revoked.
  // Clear the store without calling signOut() again (Supabase already did).
  if (event === "SIGNED_OUT" && store.isAuthenticated) {
    useAuthStore.setState({ token: null, profile: null, isAuthenticated: false });
  }
});
