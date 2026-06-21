import { useState, useRef, useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { useAuthStore } from "@/stores/auth";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { authApi, demoApi } from "@/lib/api";
import { getInitials, getErrMsg } from "@/lib/utils";
import { IS_DEMO } from "@/lib/demo";
import {
  User, Mail, Phone, Briefcase, Building2,
  MapPin, Clock, LogOut, Shield, Pencil, X, Lock, Eye, EyeOff, KeyRound,
} from "lucide-react";

export default function ProfilePage() {
  const { profile, setProfile, logout } = useAuthStore();
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [changingPw, setChangingPw] = useState(false);
  const [changePwStep, setChangePwStep] = useState<"form" | "otp">("form");
  const [showPw, setShowPw] = useState(false);
  const [newPw, setNewPw] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [otpCountdown, setOtpCountdown] = useState(0);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => { if (countdownRef.current) clearInterval(countdownRef.current); };
  }, []);

  function startCountdown() {
    if (countdownRef.current) clearInterval(countdownRef.current);
    setOtpCountdown(60);
    countdownRef.current = setInterval(() => {
      setOtpCountdown((prev) => {
        if (prev <= 1) { clearInterval(countdownRef.current!); return 0; }
        return prev - 1;
      });
    }, 1000);
  }

  function cancelChangePw() {
    if (countdownRef.current) clearInterval(countdownRef.current);
    setOtpCountdown(0);
    setChangingPw(false);
    setChangePwStep("form");
    setNewPw("");
    setOtpCode("");
  }
  const [form, setForm] = useState({
    full_name: profile?.full_name ?? "",
    phone: profile?.phone ?? "",
    position: profile?.position ?? "",
  });

  if (!profile) return null;

  const mutation = useMutation({
    mutationFn: () => authApi.updateProfile(form),
    onSuccess: (res) => {
      setProfile({ ...profile, ...res.data.data });
      toast.success("Profil diperbarui!");
      setEditing(false);
    },
    onError: (err) => toast.error("Gagal memperbarui", getErrMsg(err)),
  });

  const sendOtpMutation = useMutation({
    mutationFn: () => authApi.sendOtp(profile!.email),
    onSuccess: () => {
      setChangePwStep("otp");
      startCountdown();
      toast.success("OTP terkirim!", `Cek inbox ${profile!.email}`);
    },
    onError: (err) => toast.error("Gagal mengirim OTP", getErrMsg(err)),
  });

  const pwMutation = useMutation({
    mutationFn: () => authApi.changePasswordOtp(otpCode, newPw),
    onSuccess: () => {
      toast.success("Password berhasil diubah!");
      if (countdownRef.current) clearInterval(countdownRef.current);
      setChangingPw(false);
      setChangePwStep("form");
      setNewPw("");
      setOtpCode("");
      setOtpCountdown(0);
    },
    onError: (err) => toast.error("Gagal mengubah password", getErrMsg(err)),
  });

  const readonlyFields = [
    { icon: Mail,      label: "Email",      value: profile.email },
    { icon: Shield,    label: "Role",       value: profile.role },
    { icon: Building2, label: "Perusahaan", value: profile.companies?.name ?? "—" },
    { icon: MapPin,    label: "Kode",       value: profile.companies?.code ?? "—" },
    { icon: Clock,     label: "Jam Kerja",  value: profile.companies
        ? `${profile.companies.work_start?.slice(0, 5)} – ${profile.companies.work_end?.slice(0, 5)}`
        : "—"
    },
  ];

  return (
    <div>
      <PageHeader
        title="Profil Saya"
        action={
          !IS_DEMO && (
            <Button
              size="sm"
              variant={editing ? "outline" : "default"}
              onClick={() => {
                if (editing) {
                  setForm({ full_name: profile.full_name, phone: profile.phone ?? "", position: profile.position ?? "" });
                }
                setEditing(!editing);
                cancelChangePw();
              }}
            >
              {editing ? <><X className="h-4 w-4" /> Batal</> : <><Pencil className="h-4 w-4" /> Edit</>}
            </Button>
          )
        }
      />

      <div className="px-4 md:px-6 py-5 space-y-4 animate-fade-in">
        {/* Avatar card */}
        <Card>
          <CardContent className="p-5 flex items-center gap-4">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-400 to-indigo-600 flex items-center justify-center text-white text-2xl font-bold shadow-glow shrink-0">
              {getInitials(profile.full_name)}
            </div>
            <div>
              <h2 className="text-lg font-bold text-foreground">{profile.full_name}</h2>
              <p className="text-sm text-muted-foreground capitalize">{profile.position ?? profile.role}</p>
              <p className="text-xs text-primary font-medium mt-0.5">{profile.companies?.name}</p>
            </div>
          </CardContent>
        </Card>

        {/* Edit form */}
        {editing && (
          <Card>
            <CardContent className="p-5 space-y-4">
              <p className="text-sm font-semibold text-foreground">Edit Profil</p>
              <Input
                label="Nama Lengkap"
                value={form.full_name}
                onChange={(e) => setForm({ ...form, full_name: e.target.value })}
                leftIcon={<User className="h-4 w-4" />}
              />
              <Input
                label="No. HP"
                type="tel"
                placeholder="08xx-xxxx-xxxx"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                leftIcon={<Phone className="h-4 w-4" />}
              />
              <Input
                label="Jabatan"
                placeholder="Staff, Kasir, dll."
                value={form.position}
                onChange={(e) => setForm({ ...form, position: e.target.value })}
                leftIcon={<Briefcase className="h-4 w-4" />}
              />
              <Button
                className="w-full"
                size="lg"
                loading={mutation.isPending}
                onClick={() => mutation.mutate()}
                disabled={!form.full_name.trim()}
              >
                Simpan Perubahan
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Info list (readonly) */}
        <Card>
          <CardContent className="p-0 divide-y divide-border">
            {[
              { icon: User,      label: "Nama",    value: profile.full_name },
              { icon: Phone,     label: "No. HP",  value: profile.phone ?? "—" },
              { icon: Briefcase, label: "Jabatan", value: profile.position ?? "—" },
            ].map(({ icon: Icon, label, value }) => (
              <div key={label} className="flex items-center gap-3 px-5 py-3.5">
                <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center shrink-0">
                  <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                </div>
                <div className="flex-1">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</p>
                  <p className="text-sm font-medium text-foreground">{value}</p>
                </div>
              </div>
            ))}
            {readonlyFields.map(({ icon: Icon, label, value }) => (
              <div key={label} className="flex items-center gap-3 px-5 py-3.5">
                <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center shrink-0">
                  <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                </div>
                <div className="flex-1">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</p>
                  <p className="text-sm font-medium text-foreground capitalize">{value}</p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Change password section */}
        {!changingPw ? (
          IS_DEMO ? (
            <div className="w-full text-center text-sm text-muted-foreground py-3 border border-dashed border-border rounded-xl">
              Ganti password tidak tersedia di mode demo
            </div>
          ) : (
            <Button
              variant="outline"
              size="lg"
              className="w-full"
              onClick={() => { setChangingPw(true); setChangePwStep("form"); setEditing(false); }}
            >
              <Lock className="h-4 w-4" />
              Ganti Password
            </Button>
          )
        ) : (
          <Card>
            <CardContent className="p-5 space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-foreground">Ganti Password</p>
                <button
                  onClick={cancelChangePw}
                  className="text-muted-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {changePwStep === "form" ? (
                <>
                  <div className="relative">
                    <Input
                      label="Password Baru"
                      type={showPw ? "text" : "password"}
                      placeholder="Minimal 6 karakter"
                      value={newPw}
                      onChange={(e) => setNewPw(e.target.value)}
                      leftIcon={<Lock className="h-4 w-4" />}
                    />
                    <button
                      type="button"
                      className="absolute right-3 top-9 text-muted-foreground"
                      onClick={() => setShowPw(!showPw)}
                    >
                      {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Kode OTP akan dikirim ke <span className="font-medium">{profile.email}</span> untuk konfirmasi.
                  </p>
                  <Button
                    className="w-full"
                    size="lg"
                    loading={sendOtpMutation.isPending}
                    onClick={() => sendOtpMutation.mutate()}
                    disabled={newPw.length < 6}
                  >
                    Kirim Kode OTP
                  </Button>
                </>
              ) : (
                <>
                  <p className="text-xs text-muted-foreground">
                    Masukkan kode OTP dari <span className="font-medium">{profile.email}</span>.
                  </p>
                  <Input
                    label="Kode OTP"
                    type="text"
                    inputMode="numeric"
                    placeholder="6 digit kode"
                    value={otpCode}
                    onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    leftIcon={<KeyRound className="h-4 w-4" />}
                    autoFocus
                  />
                  <Button
                    className="w-full"
                    size="lg"
                    loading={pwMutation.isPending}
                    onClick={() => pwMutation.mutate()}
                    disabled={otpCode.length < 6}
                  >
                    Simpan Password
                  </Button>
                  {otpCountdown > 0 ? (
                    <p className="text-center text-xs text-muted-foreground">
                      OTP berlaku <span className="font-semibold text-primary">{otpCountdown}s</span>
                    </p>
                  ) : (
                    <p className="text-center text-xs text-red-500">OTP sudah expired.</p>
                  )}
                  <button
                    type="button"
                    onClick={() => sendOtpMutation.mutate()}
                    disabled={sendOtpMutation.isPending || otpCountdown > 0}
                    className="w-full text-xs text-primary font-medium disabled:opacity-40"
                  >
                    {otpCountdown > 0 ? `Kirim ulang (${otpCountdown}s)` : "Kirim ulang OTP"}
                  </button>
                </>
              )}
            </CardContent>
          </Card>
        )}

        {/* Logout */}
        <Button variant="destructive" size="lg" className="w-full" onClick={() => { if (IS_DEMO) demoApi.reset().catch(() => {}); logout(); }}>
          <LogOut className="h-4 w-4" />
          Keluar
        </Button>

        <p className="text-center text-xs text-muted-foreground pb-2">
          Donkap v1.1.0
        </p>
      </div>
    </div>
  );
}
