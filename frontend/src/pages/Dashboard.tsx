import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Clock, MapPin, CheckCircle2,
  Calendar, Timer, AlertCircle,
  LogIn, LogOut, Hourglass, Coffee, Play,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CardSkeleton } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import { useAuthStore } from "@/stores/auth";
import { useGeolocation } from "@/hooks/useGeolocation";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { attendanceApi } from "@/lib/api";
import { fmtTime, fmtDate, fmtDuration, getErrMsg, cn } from "@/lib/utils";

// Haversine distance in meters
function haversine(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export default function Dashboard() {
  const { profile } = useAuthStore();
  const toast = useToast();
  const isOnline = useOnlineStatus();
  const qc = useQueryClient();
  const { error: geoError, getPosition } = useGeolocation();
  const [clockLoading, setClockLoading] = useState<"in" | "out" | "break_start" | "break_end" | null>(null);
  const [now, setNow] = useState(new Date());
  const [livePos, setLivePos] = useState<{ lat: number; lng: number } | null>(null);

  // Watch live position for radius check
  useEffect(() => {
    if (!navigator.geolocation) return;
    const id = navigator.geolocation.watchPosition(
      (pos) => setLivePos({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => {},
      { enableHighAccuracy: true, maximumAge: 15_000 }
    );
    return () => navigator.geolocation.clearWatch(id);
  }, []);

  const company = profile?.companies;
  const distanceM = livePos && company?.lat != null && company?.lng != null
    ? Math.round(haversine(livePos.lat, livePos.lng, company.lat, company.lng))
    : null;
  const isInRadius = distanceM !== null && company?.radius_meters
    ? distanceM <= company.radius_meters
    : null; // null = belum dapat GPS

  // Live clock
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const { data: todayData, isLoading: todayLoading } = useQuery({
    queryKey: ["attendance-today"],
    queryFn: () => attendanceApi.today().then((r) => r.data),
    refetchInterval: 30_000,
    enabled: isOnline,
  });

  const { data: statsData } = useQuery({
    queryKey: ["attendance-monthly-stats"],
    queryFn: () => attendanceApi.monthlyStats().then((r) => r.data),
    enabled: isOnline,
  });

  const record = todayData?.record;
  const clockedIn  = !!record?.clock_in;
  const clockedOut = !!record?.clock_out;
  const onBreak    = !!record?.break_start && !record?.break_end;
  const flexible   = !!company?.flexible_attendance;
  const minWorkMinutes = company?.min_work_minutes ?? 480;

  // Live effective work duration for today: (clock_in → break_start) + (break_end → now/clock_out)
  const todayWorkMinutes = (() => {
    if (!record?.clock_in) return null;
    const ci = new Date(record.clock_in).getTime();
    const end = record.clock_out ? new Date(record.clock_out).getTime() : now.getTime();
    if (record.break_start && record.break_end) {
      const bs = new Date(record.break_start).getTime();
      const be = new Date(record.break_end).getTime();
      return Math.max(0, Math.floor((bs - ci) / 60_000) + Math.floor((end - be) / 60_000));
    }
    if (record.break_start && !record.break_end) {
      // sedang istirahat — durasi berhenti di break_start
      const bs = new Date(record.break_start).getTime();
      return Math.max(0, Math.floor((bs - ci) / 60_000));
    }
    return Math.max(0, Math.floor((end - ci) / 60_000));
  })();

  async function handleClock(type: "in" | "out" | "break_start" | "break_end") {
    if (!isOnline) return toast.error("Kamu offline", "Pastikan koneksi aktif");
    setClockLoading(type);
    try {
      const pos = await getPosition();
      const labels = {
        in:          { ok: "Clock-in berhasil! 🎉",      err: "Clock-in gagal" },
        out:         { ok: "Clock-out berhasil!",         err: "Clock-out gagal" },
        break_start: { ok: "Selamat istirahat ☕",        err: "Gagal mulai istirahat" },
        break_end:   { ok: "Lanjut kerja!",              err: "Gagal selesai istirahat" },
      };
      if (type === "in")          await attendanceApi.clockIn(pos.lat, pos.lng);
      else if (type === "out")    await attendanceApi.clockOut(pos.lat, pos.lng);
      else if (type === "break_start") await attendanceApi.breakStart(pos.lat, pos.lng);
      else                        await attendanceApi.breakEnd(pos.lat, pos.lng);
      toast.success(labels[type].ok, fmtTime(new Date()));
      qc.invalidateQueries({ queryKey: ["attendance-today"] });
    } catch (err) {
      const errLabels = {
        in: "Clock-in gagal", out: "Clock-out gagal",
        break_start: "Gagal mulai istirahat", break_end: "Gagal selesai istirahat",
      };
      toast.error(errLabels[type], getErrMsg(err));
    } finally {
      setClockLoading(null);
    }
  }

  const greeting = () => {
    const h = now.getHours();
    if (h < 11) return "Selamat pagi";
    if (h < 15) return "Selamat siang";
    if (h < 18) return "Selamat sore";
    return "Selamat malam";
  };

  return (
    <div className="px-4 md:px-6 py-5 space-y-5 animate-fade-in">
      {/* Welcome header */}
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">
            {fmtDate(now, "EEEE, dd MMMM yyyy")}
          </p>
          <h2 className="text-xl font-extrabold text-foreground mt-0.5">
            {greeting()}, {profile?.full_name?.split(" ")[0]} 👋
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            {profile?.companies?.name}
          </p>
        </div>
        <div className="text-right">
          <p className="text-2xl font-mono font-bold text-foreground tabular-nums">
            {now.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
          </p>
        </div>
      </div>

      {/* Status card */}
      {todayLoading ? (
        <CardSkeleton />
      ) : (
        <Card className={cn(
          "border-0 text-white overflow-hidden relative",
          clockedOut
            ? "bg-gradient-to-br from-slate-600 to-slate-800"
            : clockedIn
            ? "bg-gradient-to-br from-emerald-500 to-emerald-700"
            : "bg-gradient-to-br from-indigo-500 to-indigo-700"
        )}>
          {/* Decorative circle */}
          <div className="absolute -right-8 -top-8 w-32 h-32 rounded-full bg-white/10" />
          <div className="absolute -right-4 -bottom-8 w-24 h-24 rounded-full bg-white/5" />

          <CardContent className="px-5 py-4 relative">
            <div className="flex items-center gap-2 mb-3">
              {clockedOut ? (
                <CheckCircle2 className="h-4 w-4" />
              ) : onBreak ? (
                <Coffee className="h-4 w-4" />
              ) : clockedIn ? (
                <div className="relative">
                  <div className="w-2 h-2 rounded-full bg-white" />
                  <div className="absolute inset-0 rounded-full bg-white animate-pulse-ring" />
                </div>
              ) : (
                <Clock className="h-4 w-4" />
              )}
              <span className="text-sm font-semibold">
                {clockedOut
                  ? "Selesai hari ini"
                  : onBreak
                  ? "Sedang istirahat"
                  : clockedIn
                  ? "Sedang bekerja"
                  : "Belum absen masuk"}
              </span>
              {record?.status && (
                <Badge
                  status={record.status}
                  className="ml-auto text-xs bg-white/20 text-white border-white/30"
                />
              )}
            </div>

            {flexible ? (
              <div className="grid grid-cols-2 gap-2">
                <div className="bg-white/15 rounded-xl p-2.5">
                  <p className="text-[10px] text-white/70 mb-0.5">Masuk</p>
                  <p className="text-base font-bold font-mono">
                    {record?.clock_in ? fmtTime(record.clock_in) : "—"}
                  </p>
                </div>
                <div className="bg-white/15 rounded-xl p-2.5">
                  <p className="text-[10px] text-white/70 mb-0.5">Mulai Istirahat</p>
                  <p className="text-base font-bold font-mono">
                    {record?.break_start ? fmtTime(record.break_start) : "—"}
                  </p>
                </div>
                <div className="bg-white/15 rounded-xl p-2.5">
                  <p className="text-[10px] text-white/70 mb-0.5">Selesai Istirahat</p>
                  <p className="text-base font-bold font-mono">
                    {record?.break_end ? fmtTime(record.break_end) : "—"}
                  </p>
                </div>
                <div className="bg-white/15 rounded-xl p-2.5">
                  <p className="text-[10px] text-white/70 mb-0.5">Keluar</p>
                  <p className="text-base font-bold font-mono">
                    {record?.clock_out ? fmtTime(record.clock_out) : "—"}
                  </p>
                </div>
                <div className="col-span-2 bg-white/20 rounded-xl p-2.5 flex items-center justify-between">
                  <div>
                    <p className="text-[10px] text-white/70 mb-0.5">Durasi Kerja Efektif</p>
                    <p className="text-lg font-bold font-mono">
                      {todayWorkMinutes != null ? fmtDuration(todayWorkMinutes) : "—"}
                    </p>
                  </div>
                  <p className="text-[10px] text-white/70 text-right">
                    Minimum<br/>
                    <span className="font-bold text-white">{fmtDuration(minWorkMinutes)}</span>
                  </p>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-white/15 rounded-xl p-3">
                  <p className="text-xs text-white/70 mb-1">Masuk</p>
                  <p className="text-lg font-bold font-mono">
                    {record?.clock_in ? fmtTime(record.clock_in) : "—"}
                  </p>
                </div>
                <div className="bg-white/15 rounded-xl p-3">
                  <p className="text-xs text-white/70 mb-1">Keluar</p>
                  <p className="text-lg font-bold font-mono">
                    {record?.clock_out ? fmtTime(record.clock_out) : "—"}
                  </p>
                </div>
                <div className="bg-white/15 rounded-xl p-3">
                  <p className="text-xs text-white/70 mb-1">Durasi</p>
                  <p className="text-lg font-bold font-mono">
                    {todayWorkMinutes != null ? fmtDuration(todayWorkMinutes) : "—"}
                  </p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Clock In / Out buttons */}
      {!clockedOut && !flexible && (
        <div className="grid grid-cols-2 gap-3">
          <Button
            size="lg"
            variant="success"
            onClick={() => handleClock("in")}
            disabled={clockedIn || !isOnline || isInRadius === false}
            loading={clockLoading === "in"}
            className={cn(
              "h-16 flex-col gap-1 rounded-2xl text-sm",
              (clockedIn || isInRadius === false) && "opacity-50"
            )}
          >
            <LogIn className="h-5 w-5" />
            Clock In
          </Button>
          <Button
            size="lg"
            variant="warning"
            onClick={() => handleClock("out")}
            disabled={!clockedIn || !isOnline || isInRadius === false}
            loading={clockLoading === "out"}
            className={cn(
              "h-16 flex-col gap-1 rounded-2xl text-sm",
              (!clockedIn || isInRadius === false) && "opacity-50"
            )}
          >
            <LogOut className="h-5 w-5" />
            Clock Out
          </Button>
        </div>
      )}

      {/* Flexible mode: state-machine button (4 states) */}
      {!clockedOut && flexible && (() => {
        // Determine current step
        let next: "in" | "break_start" | "break_end" | "out";
        let label: string;
        let variant: "success" | "warning" | "default" = "success";
        let Icon = LogIn;
        if (!clockedIn) {
          next = "in";  label = "Clock In"; variant = "success"; Icon = LogIn;
        } else if (!record?.break_start) {
          next = "break_start"; label = "Mulai Istirahat"; variant = "default"; Icon = Coffee;
        } else if (!record?.break_end) {
          next = "break_end"; label = "Selesai Istirahat"; variant = "default"; Icon = Play;
        } else {
          next = "out"; label = "Clock Out"; variant = "warning"; Icon = LogOut;
        }

        const disabled = !isOnline || isInRadius === false;
        const skipBreak = next === "break_start"; // allow skipping straight to clock-out

        return (
          <div className="space-y-2">
            <Button
              size="lg"
              variant={variant}
              onClick={() => handleClock(next)}
              disabled={disabled}
              loading={clockLoading === next}
              className={cn(
                "w-full h-16 flex items-center justify-center gap-2 rounded-2xl text-base font-semibold",
                disabled && "opacity-50"
              )}
            >
              <Icon className="h-5 w-5" />
              {label}
            </Button>
            {skipBreak && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleClock("out")}
                disabled={disabled}
                loading={clockLoading === "out"}
                className="w-full"
              >
                <LogOut className="h-4 w-4 mr-1.5" />
                Langsung Clock Out (tanpa istirahat)
              </Button>
            )}
          </div>
        );
      })()}

      {/* Outside radius warning */}
      {isInRadius === false && (
        <div className="flex items-start gap-2 rounded-xl bg-red-50 border border-red-200 p-3 text-sm text-red-700">
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
          <span>
            Kamu di luar radius kantor ({distanceM}m dari kantor). Absensi hanya bisa dilakukan di dalam area radius.
          </span>
        </div>
      )}

      {/* GPS error hint */}
      {geoError && (
        <div className="flex items-start gap-2 rounded-xl bg-red-50 border border-red-200 p-3 text-sm text-red-700">
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
          <span>{geoError}</span>
        </div>
      )}

      {/* Office info */}
      {profile?.companies && (
        <Card>
          <CardContent className="px-4 py-3 flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-indigo-50 flex items-center justify-center shrink-0">
              <MapPin className="h-4 w-4 text-indigo-600" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-foreground">Area Absensi</p>
              <p className="text-xs text-muted-foreground truncate">
                Radius {profile.companies.radius_meters}m dari kantor
              </p>
              {distanceM !== null && (
                <p className={cn(
                  "text-xs font-semibold mt-0.5",
                  isInRadius ? "text-emerald-600" : "text-red-600"
                )}>
                  {isInRadius ? "✓" : "✗"} {distanceM}m dari kantor
                </p>
              )}
              {distanceM === null && (
                <p className="text-xs text-muted-foreground mt-0.5">Mendeteksi lokasi...</p>
              )}
            </div>
            <div className="text-right">
              <p className="text-xs text-muted-foreground">Jam kerja</p>
              <p className="text-xs font-mono font-semibold">
                {profile.companies.work_start?.slice(0, 5)} –{" "}
                {profile.companies.work_end?.slice(0, 5)}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Quick stats */}
      <div>
        <h3 className="text-sm font-semibold text-foreground mb-3">Bulan Ini</h3>
        <div className="grid grid-cols-2 gap-2.5">
          {[
            { label: "Hadir",     value: statsData?.hadir  ?? "—",                                                Icon: CheckCircle2, color: "text-emerald-600 bg-emerald-50" },
            { label: "Cuti",      value: statsData?.cuti   ?? "—",                                                Icon: Calendar,     color: "text-blue-600 bg-blue-50" },
            { label: "Lembur",    value: statsData?.lembur ?? "—",                                                Icon: Timer,        color: "text-amber-600 bg-amber-50" },
            { label: "Jam Kerja", value: statsData?.total_work_minutes != null ? fmtDuration(statsData.total_work_minutes) : "—", Icon: Hourglass,    color: "text-purple-600 bg-purple-50" },
          ].map(({ label, value, Icon, color }) => (
            <Card key={label} className="text-center p-3 space-y-1">
              <div className={cn("w-8 h-8 rounded-lg mx-auto flex items-center justify-center", color)}>
                <Icon className="h-4 w-4" />
              </div>
              <p className="text-xl font-bold text-foreground">{value}</p>
              <p className="text-[10px] text-muted-foreground">{label}</p>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
