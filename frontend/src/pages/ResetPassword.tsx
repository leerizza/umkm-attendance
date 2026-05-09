import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Lock, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { supabase } from "@/lib/supabase";

export default function ResetPasswordPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const [ready, setReady]       = useState(false);
  const [invalid, setInvalid]   = useState(false);
  const readyRef                = useRef(false);
  const [done, setDone]         = useState(false);
  const [loading, setLoading]   = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm]   = useState("");

  useEffect(() => {
    // Supabase v2 parses the #access_token from URL hash automatically.
    // Listen for PASSWORD_RECOVERY event to confirm it's a valid reset link.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        readyRef.current = true;
        setReady(true);
      }
    });

    // Fallback: check hash directly in case event already fired
    const hash = window.location.hash;
    if (hash.includes("type=recovery")) {
      readyRef.current = true;
      setReady(true);
    } else {
      // Give Supabase a moment to process the hash before declaring invalid.
      // Use readyRef (not the `ready` state) to avoid stale closure.
      const timer = setTimeout(() => {
        if (!readyRef.current) setInvalid(true);
      }, 2000);
      return () => {
        clearTimeout(timer);
        subscription.unsubscribe();
      };
    }

    return () => subscription.unsubscribe();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) {
      toast.error("Password tidak cocok", "Pastikan kedua password sama");
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      setDone(true);
      await supabase.auth.signOut();
    } catch (err: any) {
      toast.error("Gagal reset password", err?.message ?? "Silakan coba lagi");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-blue-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm animate-fade-in">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <img src="/donkap-id.png" alt="Donkap" className="w-16 h-16 object-contain mb-3" />
          <h1 className="text-2xl font-extrabold text-foreground">Donkap</h1>
        </div>

        <div className="bg-white rounded-2xl shadow-card border border-border overflow-hidden">
          <div className="p-5">
            {done ? (
              /* Success state */
              <div className="text-center space-y-4 py-4">
                <div className="w-14 h-14 rounded-full bg-emerald-50 flex items-center justify-center mx-auto">
                  <CheckCircle2 className="h-7 w-7 text-emerald-600" />
                </div>
                <div>
                  <p className="font-bold text-foreground">Password berhasil diubah!</p>
                  <p className="text-sm text-muted-foreground mt-1">Silakan login dengan password baru kamu.</p>
                </div>
                <Button className="w-full" onClick={() => navigate("/login")}>
                  Ke Halaman Login
                </Button>
              </div>
            ) : invalid ? (
              /* Invalid/expired link */
              <div className="text-center space-y-4 py-4">
                <p className="font-bold text-foreground">Link tidak valid</p>
                <p className="text-sm text-muted-foreground">Link reset sudah kedaluwarsa atau tidak valid.</p>
                <Button variant="outline" className="w-full" onClick={() => navigate("/login")}>
                  Kembali ke Login
                </Button>
              </div>
            ) : !ready ? (
              /* Loading state */
              <div className="text-center py-8">
                <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
                <p className="text-sm text-muted-foreground mt-3">Memverifikasi link...</p>
              </div>
            ) : (
              /* Reset form */
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <p className="font-bold text-foreground mb-1">Buat Password Baru</p>
                  <p className="text-xs text-muted-foreground">Minimal 6 karakter.</p>
                </div>
                <Input
                  label="Password Baru"
                  type="password"
                  placeholder="Min. 6 karakter"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  leftIcon={<Lock className="h-4 w-4" />}
                  required
                  minLength={6}
                  autoFocus
                />
                <Input
                  label="Konfirmasi Password"
                  type="password"
                  placeholder="Ulangi password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  leftIcon={<Lock className="h-4 w-4" />}
                  required
                  minLength={6}
                />
                <Button
                  type="submit"
                  className="w-full"
                  size="lg"
                  loading={loading}
                  disabled={!password || !confirm}
                >
                  Simpan Password Baru
                </Button>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
