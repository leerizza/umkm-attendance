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
