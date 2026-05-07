import { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Mail, Lock, User, Phone, Briefcase, Building2, KeyRound } from "lucide-react";
import { Turnstile, type TurnstileInstance } from "@marsidev/react-turnstile";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuthStore } from "@/stores/auth";
import { useToast } from "@/components/ui/toast";
import { authApi } from "@/lib/api";
import { supabase } from "@/lib/supabase";
import { getErrMsg, cn } from "@/lib/utils";

const TURNSTILE_SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY as string;

type Tab = "login" | "register";
type RegType = "employee" | "owner";

export default function LoginPage() {
  const [tab, setTab] = useState<Tab>("login");
  const [loading, setLoading] = useState(false);
  const [showPass, setShowPass] = useState(false);
  const navigate = useNavigate();
  const { setAuth } = useAuthStore();
  const toast = useToast();

  // ── Captcha ───────────────────────────────────────────────────────────────
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const turnstileRef = useRef<TurnstileInstance>(null);

  function resetCaptcha() {
    setCaptchaToken(null);
    turnstileRef.current?.reset();
  }

  // ── Login form ────────────────────────────────────────────────────────────
  const [loginForm, setLoginForm] = useState({ email: "", password: "" });

  // ── Forgot password (OTP flow) ────────────────────────────────────────────
  const [forgotMode, setForgotMode]   = useState(false);
  const [forgotStep, setForgotStep]   = useState<"email" | "otp">("email");
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotOtp, setForgotOtp]     = useState("");
  const [forgotNewPw, setForgotNewPw] = useState("");

  // ── Register form ─────────────────────────────────────────────────────────
  const [regType, setRegType] = useState<RegType>("employee");
  const [regStep, setRegStep] = useState<"form" | "verify">("form");
  const [regOtpEmail, setRegOtpEmail] = useState("");
  const [regOtpCode, setRegOtpCode]   = useState("");
  const [regForm, setRegForm] = useState({
    full_name: "", email: "", password: "",
    company_code: "", phone: "", position: "",
  });
  const [ownerForm, setOwnerForm] = useState({
    full_name: "", email: "", password: "",
    phone: "", company_name: "", company_code: "",
  });

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    if (!captchaToken) {
      toast.error("Verifikasi captcha dulu", "Centang kotak di bawah sebelum login.");
      return;
    }
    setLoading(true);
    try {
      const res = await authApi.login(loginForm.email, loginForm.password, captchaToken);
      const { access_token, refresh_token } = res.data;

      await supabase.auth.setSession({ access_token, refresh_token });

      const profileRes = await authApi.me(access_token);
      const profile = profileRes.data;

      setAuth(access_token, { ...profile, email: loginForm.email });
      toast.success("Selamat datang!", `Halo, ${profile.full_name}`);
      navigate("/");
    } catch (err: any) {
      const isNetworkErr = !err?.response;
      const msg = isNetworkErr
        ? "Periksa koneksi internet kamu"
        : getErrMsg(err);
      toast.error("Login Gagal", msg);
      resetCaptcha();
    } finally {
      setLoading(false);
    }
  }

  // ── Forgot password: step 1 — send OTP ───────────────────────────────────
  async function handleForgotSendOtp(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      await authApi.sendOtp(forgotEmail, captchaToken ?? undefined);
      setForgotStep("otp");
      resetCaptcha();
      toast.success("OTP terkirim!", `Cek inbox ${forgotEmail}`);
    } catch (err) {
      toast.error("Gagal mengirim OTP", getErrMsg(err));
      resetCaptcha();
    } finally {
      setLoading(false);
    }
  }

  // ── Forgot password: step 2 — verify OTP + set new password ──────────────
  async function handleForgotReset(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      await authApi.resetPasswordOtp(forgotEmail, forgotOtp, forgotNewPw);
      toast.success("Password berhasil direset!", "Silakan login dengan password baru.");
      setForgotMode(false);
      setForgotStep("email");
      setForgotEmail("");
      setForgotOtp("");
      setForgotNewPw("");
    } catch (err) {
      toast.error("Gagal reset password", getErrMsg(err));
    } finally {
      setLoading(false);
    }
  }

  // ── Register employee ─────────────────────────────────────────────────────
  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      await authApi.register(regForm);
      setRegOtpEmail(regForm.email);
      setRegStep("verify");
      toast.success("OTP terkirim!", `Cek inbox ${regForm.email}`);
    } catch (err) {
      toast.error("Registrasi Gagal", getErrMsg(err));
    } finally {
      setLoading(false);
    }
  }

  // ── Register owner ────────────────────────────────────────────────────────
  async function handleRegisterOwner(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      await authApi.registerCompany({
        ...ownerForm,
        company_code: ownerForm.company_code.toUpperCase(),
      });
      setRegOtpEmail(ownerForm.email);
      setRegStep("verify");
      toast.success("OTP terkirim!", `Cek inbox ${ownerForm.email}`);
    } catch (err) {
      toast.error("Gagal Daftar", getErrMsg(err));
    } finally {
      setLoading(false);
    }
  }

  // ── OTP verification after register → create profile → auto-login ─────────
  async function handleVerifyRegister(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      if (regType === "employee") {
        await authApi.verifyRegister({
          email: regOtpEmail,
          token: regOtpCode,
          full_name: regForm.full_name,
          company_code: regForm.company_code,
          phone: regForm.phone || undefined,
          position: regForm.position || undefined,
        });
      } else {
        await authApi.verifyRegisterCompany({
          email: regOtpEmail,
          token: regOtpCode,
          full_name: ownerForm.full_name,
          company_name: ownerForm.company_name,
          company_code: ownerForm.company_code,
          phone: ownerForm.phone || undefined,
        });
      }

      // Registrasi selesai — arahkan ke login, jangan auto-login
      // untuk mencegah session bleed dari user yang sebelumnya login
      toast.success("Registrasi berhasil!", "Silakan login dengan akun baru kamu.");
      setTab("login");
      setLoginForm({ email: regOtpEmail, password: "" });
      setRegStep("form");
      setRegOtpCode("");
      setRegOtpEmail("");
    } catch (err) {
      toast.error("Verifikasi Gagal", getErrMsg(err));
    } finally {
      setLoading(false);
    }
  }

  // ── Resend OTP ────────────────────────────────────────────────────────────
  async function handleResendOtp(email: string) {
    setLoading(true);
    try {
      await authApi.sendOtp(email);
      toast.success("OTP dikirim ulang!", `Cek inbox ${email}`);
    } catch (err) {
      toast.error("Gagal kirim ulang", getErrMsg(err));
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
                onClick={() => { setTab(t); setRegStep("form"); }}
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
                forgotStep === "email" ? (
                  <form onSubmit={handleForgotSendOtp} className="space-y-4">
                    <div>
                      <p className="font-bold text-foreground text-sm mb-1">Lupa Password?</p>
                      <p className="text-xs text-muted-foreground">Masukkan email kamu, kami kirim kode OTP.</p>
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
                    <Turnstile
                      ref={turnstileRef}
                      siteKey={TURNSTILE_SITE_KEY}
                      onSuccess={(token) => setCaptchaToken(token)}
                      onExpire={resetCaptcha}
                      onError={resetCaptcha}
                      options={{ theme: "light", size: "flexible" }}
                    />
                    <Button type="submit" className="w-full" size="lg" loading={loading} disabled={!captchaToken}>
                      Kirim Kode OTP
                    </Button>
                    <button
                      type="button"
                      onClick={() => { setForgotMode(false); setForgotStep("email"); setForgotEmail(""); resetCaptcha(); }}
                      className="w-full text-xs text-muted-foreground hover:text-foreground"
                    >
                      Batal, kembali ke login
                    </button>
                  </form>
                ) : (
                  /* Step 2: OTP + new password */
                  <form onSubmit={handleForgotReset} className="space-y-4">
                    <div>
                      <p className="font-bold text-foreground text-sm mb-1">Reset Password</p>
                      <p className="text-xs text-muted-foreground">
                        Masukkan kode OTP dari <span className="font-medium">{forgotEmail}</span> dan password baru.
                      </p>
                    </div>
                    <Input
                      label="Kode OTP"
                      type="text"
                      inputMode="numeric"
                      placeholder="8 digit kode"
                      value={forgotOtp}
                      onChange={(e) => setForgotOtp(e.target.value.replace(/\D/g, "").slice(0, 8))}
                      leftIcon={<KeyRound className="h-4 w-4" />}
                      required
                      autoFocus
                    />
                    <Input
                      label="Password Baru"
                      type="password"
                      placeholder="Min. 6 karakter"
                      value={forgotNewPw}
                      onChange={(e) => setForgotNewPw(e.target.value)}
                      leftIcon={<Lock className="h-4 w-4" />}
                      required
                      minLength={6}
                    />
                    <Button type="submit" className="w-full" size="lg" loading={loading}>
                      Reset Password
                    </Button>
                    <div className="flex justify-between text-xs">
                      <button
                        type="button"
                        onClick={() => setForgotStep("email")}
                        className="text-muted-foreground hover:text-foreground"
                      >
                        Ganti email
                      </button>
                      <button
                        type="button"
                        onClick={() => handleResendOtp(forgotEmail)}
                        disabled={loading}
                        className="text-primary font-medium disabled:opacity-50"
                      >
                        Kirim ulang OTP
                      </button>
                    </div>
                  </form>
                )
              ) : (
                /* ── Login form ── */
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
                  <Turnstile
                    ref={turnstileRef}
                    siteKey={TURNSTILE_SITE_KEY}
                    onSuccess={(token) => setCaptchaToken(token)}
                    onExpire={resetCaptcha}
                    onError={resetCaptcha}
                    options={{ theme: "light", size: "flexible" }}
                  />
                  <Button type="submit" className="w-full" size="lg" loading={loading} disabled={!captchaToken}>
                    Masuk
                  </Button>
                  <div className="text-center">
                    <button
                      type="button"
                      onClick={() => { setForgotMode(true); setForgotStep("email"); setForgotEmail(loginForm.email); }}
                      className="text-xs text-muted-foreground hover:text-primary transition-colors"
                    >
                      Lupa password?
                    </button>
                  </div>
                </form>
              )
            ) : (
              /* ── Register tab ── */
              regStep === "verify" ? (
                /* OTP verification step */
                <form onSubmit={handleVerifyRegister} className="space-y-4">
                  <div className="text-center space-y-1 pb-1">
                    <div className="w-12 h-12 rounded-full bg-indigo-50 flex items-center justify-center mx-auto mb-2">
                      <KeyRound className="h-5 w-5 text-primary" />
                    </div>
                    <p className="font-bold text-foreground text-sm">Verifikasi Email</p>
                    <p className="text-xs text-muted-foreground">
                      Masukkan kode OTP yang dikirim ke{" "}
                      <span className="font-medium">{regOtpEmail}</span>
                    </p>
                  </div>
                  <Input
                    label="Kode OTP"
                    type="text"
                    inputMode="numeric"
                    placeholder="8 digit kode"
                    value={regOtpCode}
                    onChange={(e) => setRegOtpCode(e.target.value.replace(/\D/g, "").slice(0, 8))}
                    leftIcon={<KeyRound className="h-4 w-4" />}
                    required
                    autoFocus
                  />
                  <Button type="submit" className="w-full" size="lg" loading={loading}>
                    Verifikasi & Masuk
                  </Button>
                  <div className="flex justify-between text-xs">
                    <button
                      type="button"
                      onClick={() => { setRegStep("form"); setRegOtpCode(""); }}
                      className="text-muted-foreground hover:text-foreground"
                    >
                      Kembali
                    </button>
                    <button
                      type="button"
                      onClick={() => handleResendOtp(regOtpEmail)}
                      disabled={loading}
                      className="text-primary font-medium disabled:opacity-50"
                    >
                      Kirim ulang OTP
                    </button>
                  </div>
                </form>
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
              )
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
