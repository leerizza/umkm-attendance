import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Skeleton } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import { useAuthStore } from "@/stores/auth";
import { authApi } from "@/lib/api";
import { supabase } from "@/lib/supabase";
import { getErrMsg } from "@/lib/utils";

/**
 * Landing page after an SSO redirect (e.g. "Masuk dengan Google").
 *
 * The Supabase client exchanges the PKCE `?code=` for a session on load
 * (detectSessionInUrl). We then ask the backend to finish the login: it only
 * accepts emails that already belong to a Donkap account — SSO never creates
 * accounts or joins anyone to a company.
 */
export default function AuthCallbackPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const { setAuth } = useAuthStore();
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    async function fail(title: string, detail?: string) {
      // Local only: the server-side session may already be gone (user deleted).
      await supabase.auth.signOut({ scope: "local" }).catch(() => {});
      toast.error(title, detail, 10000);
      navigate("/login", { replace: true });
    }

    (async () => {
      const url = new URL(window.location.href);
      const urlError = url.searchParams.get("error_description") || url.searchParams.get("error");
      if (urlError) {
        await fail("Login dibatalkan", urlError);
        return;
      }

      // getSession() waits for the client's initialization, incl. the code exchange.
      const { data, error } = await supabase.auth.getSession();
      const session = data?.session;
      if (error || !session) {
        await fail("Login gagal", error?.message || "Sesi tidak ditemukan, coba lagi.");
        return;
      }

      try {
        const res = await authApi.ssoSession(session.access_token);
        const profile = res.data;
        setAuth(session.access_token, { ...profile, email: session.user.email ?? "" });
        toast.success("Selamat datang!", `Halo, ${profile.full_name}`);
        navigate("/", { replace: true });
      } catch (err: any) {
        const detail = err?.response?.data?.detail;
        if (detail === "sso_not_registered") {
          await fail(
            "Email belum terdaftar",
            `${session.user.email} belum terdaftar di Donkap dan belum diundang. Minta admin perusahaanmu mengundang email ini, atau daftar dengan kode perusahaan.`,
          );
          return;
        }
        if (detail === "pending_approval") {
          await fail(
            "Akun sedang diverifikasi",
            "Perusahaan kamu sedang menunggu persetujuan tim Donkap.",
          );
          return;
        }
        await fail("Login gagal", getErrMsg(err) || err?.message);
      }
    })();
  }, [navigate, setAuth, toast]);

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-3">
        <p className="text-sm text-muted-foreground text-center">Memproses login…</p>
        <Skeleton className="h-10 w-full" />
      </div>
    </div>
  );
}
