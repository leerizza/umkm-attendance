import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Clock, Mail, Lock, User, Phone, Briefcase, Building2, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuthStore } from "@/stores/auth";
import { useToast } from "@/components/ui/toast";
import { authApi } from "@/lib/api";
import { supabase } from "@/lib/supabase";
import { getErrMsg, cn } from "@/lib/utils";

type Tab = "login" | "register";

export default function LoginPage() {
  const [tab, setTab] = useState<Tab>("login");
  const [loading, setLoading] = useState(false);
  const [showPass, setShowPass] = useState(false);
  const [forgotMode, setForgotMode] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotSent, setForgotSent] = useState(false);
  const navigate = useNavigate();
  const { setAuth } = useAuthStore();
  const toast = useToast();

  // Login form
  const [loginForm, setLoginForm] = useState({ email: "", password: "" });

  // Register form — employee (join existing company)
  const [regForm, setRegForm] = useState({
    full_name: "", email: "", password: "",
    company_code: "", phone: "", position: "",
  });

  // Register form — admin (create new company)
  type RegType = "employee" | "owner";
  const [regType, setRegType] = useState<RegType>("employee");
  const [ownerForm, setOwnerForm] = useState({
    full_name: "", email: "", password: "",
    phone: "", company_name: "", company_code: "",
  });

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await authApi.login(loginForm.email, loginForm.password);
      const { access_token, refresh_token } = res.data;

      // Set Supabase session so RLS policies work for direct queries
      await supabase.auth.setSession({ access_token, refresh_token });

      // Fetch profile from Supabase directly
      const { data: profile, error } = await supabase
        .from("profiles")
        .select("*, companies(*)")
        .eq("id", res.data.user.id)
        .single();

      if (error) throw error;

      setAuth(access_token, { ...profile, email: loginForm.email });
      toast.success("Selamat datang!", `Halo, ${profile.full_name}`);
      navigate("/");
    } catch (err) {
      toast.error("Login Gagal", getErrMsg(err));
    } finally {
      setLoading(false);
    }
  }

  async function handleForgot(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(forgotEmail, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) throw error;
      setForgotSent(true);
    } catch (err) {
      toast.error("Gagal mengirim email", getErrMsg(err));
    } finally {
      setLoading(false);
    }
  }

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      await authApi.register(regForm);
      toast.success("Registrasi berhasil!", "Silakan login dengan akun baru kamu.");
      setTab("login");
      setLoginForm({ email: regForm.email, password: "" });
    } catch (err) {
      toast.error("Registrasi Gagal", getErrMsg(err));
    } finally {
      setLoading(false);
    }
  }

  async function handleRegisterOwner(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await authApi.registerCompany({
        ...ownerForm,
        company_code: ownerForm.company_code.toUpperCase(),
      });
      toast.success(
        "Perusahaan berhasil dibuat!",
        `Kode perusahaan: ${res.data.company_code} — bagikan ke karyawan.`
      );
      setTab("login");
      setLoginForm({ email: ownerForm.email, password: "" });
    } catch (err) {
      toast.error("Gagal Daftar", getErrMsg(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-blue-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm animate-fade-in">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <img src="/donkap-id.png" alt="Donkap ID" className="w-16 h-16 object-contain mb-3" />
          <h1 className="text-2xl font-extrabold text-foreground">Donkap</h1>
          <p className="text-sm text-muted-foreground mt-1">Sistem absensi digital untuk UMKM</p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-card border border-border overflow-hidden">
          {/* Tab switcher */}
          <div className="flex border-b border-border">
            {(["login", "register"] as Tab[]).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={cn(
                  "flex-1 py-3.5 text-sm font-semibold transition-colors",
                  tab === t
                    ? "text-primary border-b-2 border-primary"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {t === "login" ? "Masuk" : "Daftar"}
              </button>
            ))}
          </div>

          <div className="p-5">
            {tab === "login" ? (
              forgotMode ? (
                /* ── Forgot password ── */
                forgotSent ? (
                  <div className="text-center space-y-4 py-2">
                    <div className="w-12 h-12 rounded-full bg-emerald-50 flex items-center justify-center mx-auto">
                      <CheckCircle2 className="h-6 w-6 text-emerald-600" />
                    </div>
                    <div>
                      <p className="font-bold text-foreground">Email terkirim!</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Cek inbox <span className="font-medium">{forgotEmail}</span> dan klik link untuk reset password.
                      </p>
                    </div>
                    <button
                      onClick={() => { setForgotMode(false); setForgotSent(false); setForgotEmail(""); }}
                      className="text-xs text-primary font-medium"
                    >
                      Kembali ke login
                    </button>
                  </div>
                ) : (
                  <form onSubmit={handleForgot} className="space-y-4">
                    <div>
                      <p className="font-bold text-foreground text-sm mb-1">Lupa Password?</p>
                      <p className="text-xs text-muted-foreground">Masukkan email kamu, kami kirim link reset.</p>
                    </div>
                    <Input
                      label="Email"
                      type="email"
                      placeholder="nama@email.com"
                      value={forgotEmail}
                      onChange={(e) => setForgotEmail(e.target.value)}
                      leftIcon={<Mail className="h-4 w-4" />}
                      required
                      autoFocus
                    />
                    <Button type="submit" className="w-full" size="lg" loading={loading}>
                      Kirim Link Reset
                    </Button>
                    <button
                      type="button"
                      onClick={() => setForgotMode(false)}
                      className="w-full text-xs text-muted-foreground hover:text-foreground"
                    >
                      Batal, kembali ke login
                    </button>
                  </form>
                )
              ) : (
              <form onSubmit={handleLogin} className="space-y-4">
                <Input
                  label="Email"
                  type="email"
                  placeholder="nama@email.com"
                  value={loginForm.email}
                  onChange={(e) => setLoginForm({ ...loginForm, email: e.target.value })}
                  leftIcon={<Mail className="h-4 w-4" />}
                  required
                  autoComplete="email"
                />
                <div>
                  <Input
                    label="Password"
                    type={showPass ? "text" : "password"}
                    placeholder="••••••••"
                    value={loginForm.password}
                    onChange={(e) => setLoginForm({ ...loginForm, password: e.target.value })}
                    leftIcon={<Lock className="h-4 w-4" />}
                    required
                    autoComplete="current-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPass(!showPass)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                    tabIndex={-1}
                  />
                </div>
                <Button type="submit" className="w-full" size="lg" loading={loading}>
                  Masuk
                </Button>
                <div className="text-center">
                  <button
                    type="button"
                    onClick={() => { setForgotMode(true); setForgotEmail(loginForm.email); }}
                    className="text-xs text-muted-foreground hover:text-primary transition-colors"
                  >
                    Lupa password?
                  </button>
                </div>
              </form>
              )
            ) : (
              <div className="space-y-3">
                {/* Toggle: employee vs owner */}
                <div className="flex rounded-xl border border-border overflow-hidden">
                  {(["employee", "owner"] as RegType[]).map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setRegType(t)}
                      className={cn(
                        "flex-1 py-2 text-xs font-semibold transition-colors",
                        regType === t
                          ? "bg-primary text-white"
                          : "text-muted-foreground hover:text-foreground"
                      )}
                    >
                      {t === "employee" ? "Saya Karyawan" : "Saya Pemilik / Admin"}
                    </button>
                  ))}
                </div>

                {regType === "employee" ? (
                  /* ── Employee: join existing company ── */
                  <form onSubmit={handleRegister} className="space-y-3">
                    <p className="text-xs text-muted-foreground">
                      Minta <strong>Kode Perusahaan</strong> ke admin/pemilik usahamu.
                    </p>
                    <Input
                      label="Nama Lengkap"
                      placeholder="Budi Santoso"
                      value={regForm.full_name}
                      onChange={(e) => setRegForm({ ...regForm, full_name: e.target.value })}
                      leftIcon={<User className="h-4 w-4" />}
                      required
                    />
                    <Input
                      label="Email"
                      type="email"
                      placeholder="nama@email.com"
                      value={regForm.email}
                      onChange={(e) => setRegForm({ ...regForm, email: e.target.value })}
                      leftIcon={<Mail className="h-4 w-4" />}
                      required
                    />
                    <Input
                      label="Password"
                      type="password"
                      placeholder="Min. 6 karakter"
                      value={regForm.password}
                      onChange={(e) => setRegForm({ ...regForm, password: e.target.value })}
                      leftIcon={<Lock className="h-4 w-4" />}
                      required
                      minLength={6}
                    />
                    <Input
                      label="Kode Perusahaan"
                      placeholder="Contoh: TOKO2025"
                      value={regForm.company_code}
                      onChange={(e) => setRegForm({ ...regForm, company_code: e.target.value.toUpperCase() })}
                      leftIcon={<Building2 className="h-4 w-4" />}
                      required
                    />
                    <Input
                      label="No. HP (Opsional)"
                      type="tel"
                      placeholder="08xx-xxxx-xxxx"
                      value={regForm.phone}
                      onChange={(e) => setRegForm({ ...regForm, phone: e.target.value })}
                      leftIcon={<Phone className="h-4 w-4" />}
                    />
                    <Input
                      label="Jabatan (Opsional)"
                      placeholder="Staff, Kasir, dll."
                      value={regForm.position}
                      onChange={(e) => setRegForm({ ...regForm, position: e.target.value })}
                      leftIcon={<Briefcase className="h-4 w-4" />}
                    />
                    <Button type="submit" className="w-full" size="lg" loading={loading}>
                      Buat Akun
                    </Button>
                  </form>
                ) : (
                  /* ── Owner: create new company + admin account ── */
                  <form onSubmit={handleRegisterOwner} className="space-y-3">
                    <p className="text-xs text-muted-foreground">
                      Daftarkan usahamu sekaligus buat akun admin. Kode perusahaan akan dibagikan ke karyawan.
                    </p>
                    <Input
                      label="Nama Kamu"
                      placeholder="Budi Santoso"
                      value={ownerForm.full_name}
                      onChange={(e) => setOwnerForm({ ...ownerForm, full_name: e.target.value })}
                      leftIcon={<User className="h-4 w-4" />}
                      required
                    />
                    <Input
                      label="Email"
                      type="email"
                      placeholder="nama@email.com"
                      value={ownerForm.email}
                      onChange={(e) => setOwnerForm({ ...ownerForm, email: e.target.value })}
                      leftIcon={<Mail className="h-4 w-4" />}
                      required
                    />
                    <Input
                      label="Password"
                      type="password"
                      placeholder="Min. 6 karakter"
                      value={ownerForm.password}
                      onChange={(e) => setOwnerForm({ ...ownerForm, password: e.target.value })}
                      leftIcon={<Lock className="h-4 w-4" />}
                      required
                      minLength={6}
                    />
                    <Input
                      label="Nama Usaha / Perusahaan"
                      placeholder="Toko Budi Jaya"
                      value={ownerForm.company_name}
                      onChange={(e) => setOwnerForm({ ...ownerForm, company_name: e.target.value })}
                      leftIcon={<Building2 className="h-4 w-4" />}
                      required
                    />
                    <Input
                      label="Kode Perusahaan"
                      placeholder="Contoh: BUDIJAYA25 (unik, huruf kapital)"
                      value={ownerForm.company_code}
                      onChange={(e) => setOwnerForm({ ...ownerForm, company_code: e.target.value.toUpperCase() })}
                      leftIcon={<Briefcase className="h-4 w-4" />}
                      required
                      minLength={3}
                    />
                    <Input
                      label="No. HP (Opsional)"
                      type="tel"
                      placeholder="08xx-xxxx-xxxx"
                      value={ownerForm.phone}
                      onChange={(e) => setOwnerForm({ ...ownerForm, phone: e.target.value })}
                      leftIcon={<Phone className="h-4 w-4" />}
                    />
                    <Button type="submit" className="w-full" size="lg" loading={loading}>
                      Daftarkan Usaha & Buat Akun
                    </Button>
                  </form>
                )}
              </div>
            )}
          </div>
        </div>

        <p className="text-center text-xs text-muted-foreground mt-4">
          Donkap &copy; 2026
        </p>
      </div>
    </div>
  );
}
