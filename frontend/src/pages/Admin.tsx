import { Fragment, useEffect, useState } from "react";
import { LocationPicker } from "@/components/LocationPicker";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Users, Clock, CalendarOff, Timer,
  CheckCircle2, XCircle, ChevronLeft, ChevronRight,
  TrendingUp, Settings, Download, Pencil, BarChart2, Search, X, MapPin, Mail, Phone,
} from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge, CardSkeleton, TableRowSkeleton } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/components/ui/toast";
import { adminApi, leaveApi, overtimeApi, correctionsApi, locationsApi } from "@/lib/api";
import { fmtDate, fmtTime, fmtDuration, getErrMsg, cn, effectiveMinutes } from "@/lib/utils";
import { useAuthStore } from "@/stores/auth";
import { IS_DEMO } from "@/lib/demo";

type AdminTab = "overview" | "attendance" | "leave" | "overtime" | "employees" | "corrections" | "report" | "settings";

const TABS: { id: AdminTab; label: string; Icon: any }[] = [
  { id: "overview",    label: "Overview",   Icon: TrendingUp },
  { id: "attendance",  label: "Absensi",    Icon: Clock },
  { id: "leave",       label: "Cuti",       Icon: CalendarOff },
  { id: "overtime",    label: "Lembur",     Icon: Timer },
  { id: "corrections", label: "Koreksi",    Icon: Pencil },
  { id: "employees",   label: "Karyawan",   Icon: Users },
  { id: "report",      label: "Rekap",      Icon: BarChart2 },
  { id: "settings",    label: "Pengaturan", Icon: Settings },
];

export default function AdminPage() {
  const { profile: adminProfile } = useAuthStore();
  const [tab, setTab] = useState<AdminTab>("overview");
  const otEnabled = adminProfile?.companies?.overtime_enabled ?? true;

  // If overtime is disabled and we're on that tab, bounce to overview
  useEffect(() => {
    if (tab === "overtime" && !otEnabled) setTab("overview");
  }, [otEnabled]);
  const [page, setPage] = useState(1);
  const toast = useToast();
  const qc = useQueryClient();

  // ── Stats ──────────────────────────────────────────────────
  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ["admin-stats"],
    queryFn: () => adminApi.stats().then((r) => r.data),
    refetchInterval: 60_000,
  });

  // ── Attendance ─────────────────────────────────────────────
  const [attDateFrom, setAttDateFrom] = useState("");
  const [attDateTo,   setAttDateTo]   = useState("");

  const { data: attData, isLoading: attLoading } = useQuery({
    queryKey: ["admin-attendance", page, attDateFrom, attDateTo],
    queryFn: () => adminApi.attendance(page, attDateFrom || undefined, attDateTo || undefined).then((r) => r.data),
    enabled: tab === "attendance",
    placeholderData: (p) => p,
  });

  // Total durasi semua baris yang ada clock_in & clock_out
  const totalWorkMinutes = (attData?.data ?? []).reduce((sum: number, row: any) => {
    return sum + (effectiveMinutes(row) ?? 0);
  }, 0);
  const rowsWithDuration = (attData?.data ?? []).filter((r: any) => r.clock_in && r.clock_out).length;

  // ── Leave ──────────────────────────────────────────────────
  const [leaveFilter, setLeaveFilter] = useState("pending");
  const [leaveFrom,   setLeaveFrom]   = useState("");
  const [leaveTo,     setLeaveTo]     = useState("");
  const { data: leaveData, isLoading: leaveLoading } = useQuery({
    queryKey: ["admin-leave", page, leaveFilter, leaveFrom, leaveTo],
    queryFn: () => adminApi.leave(page, leaveFilter || undefined, leaveFrom || undefined, leaveTo || undefined).then((r) => r.data),
    enabled: tab === "leave",
    placeholderData: (p) => p,
  });

  // ── Overtime ───────────────────────────────────────────────
  const [otFilter, setOtFilter] = useState("pending");
  const [otFrom,   setOtFrom]   = useState("");
  const [otTo,     setOtTo]     = useState("");
  const { data: otData, isLoading: otLoading } = useQuery({
    queryKey: ["admin-overtime", page, otFilter, otFrom, otTo],
    queryFn: () => adminApi.overtime(page, otFilter || undefined, otFrom || undefined, otTo || undefined).then((r) => r.data),
    enabled: tab === "overtime",
    placeholderData: (p) => p,
  });

  // ── Corrections ───────────────────────────────────────────
  const [corrFilter, setCorrFilter] = useState("pending");
  const [corrFrom,   setCorrFrom]   = useState("");
  const [corrTo,     setCorrTo]     = useState("");
  const [reasonModal, setReasonModal] = useState<string | null>(null);
  const { data: corrData, isLoading: corrLoading } = useQuery({
    queryKey: ["admin-corrections", page, corrFilter, corrFrom, corrTo],
    queryFn: () => correctionsApi.adminList(page, corrFilter || undefined, corrFrom || undefined, corrTo || undefined).then((r) => r.data),
    enabled: tab === "corrections",
    placeholderData: (p) => p,
  });

  const approveCorr = useMutation({
    mutationFn: ({ id, status, note }: { id: string; status: string; note?: string }) =>
      correctionsApi.approve(id, status, note),
    onSuccess: (_, { status }) => {
      toast.success(`Koreksi ${status === "approved" ? "disetujui" : "ditolak"}`);
      qc.invalidateQueries({ queryKey: ["admin-corrections"] });
      qc.invalidateQueries({ queryKey: ["admin-stats"] });
    },
    onError: (err) => toast.error("Gagal", getErrMsg(err)),
  });

  // ── Monthly report ────────────────────────────────────────
  const now = new Date();
  const [reportYear,  setReportYear]  = useState(now.getFullYear());
  const [reportMonth, setReportMonth] = useState(now.getMonth() + 1);

  const { data: reportData, isLoading: reportLoading } = useQuery({
    queryKey: ["admin-report", reportYear, reportMonth],
    queryFn: () => adminApi.monthlyReport(reportYear, reportMonth).then((r) => r.data),
    enabled: tab === "report",
  });

  // ── Employees ──────────────────────────────────────────────
  const [empSearch, setEmpSearch] = useState("");
  const [empSearchDebounced, setEmpSearchDebounced] = useState("");
  const [empActiveFilter, setEmpActiveFilter] = useState<"all" | "active" | "inactive">("all");
  const [empHistModal, setEmpHistModal] = useState<{ id: string; name: string } | null>(null);
  const [empHistPage, setEmpHistPage] = useState(1);

  useEffect(() => {
    const t = setTimeout(() => setEmpSearchDebounced(empSearch), 350);
    return () => clearTimeout(t);
  }, [empSearch]);

  const { data: empData, isLoading: empLoading } = useQuery({
    queryKey: ["admin-employees", page, empSearchDebounced, empActiveFilter],
    queryFn: () => adminApi.employees(
      page,
      empSearchDebounced || undefined,
      empActiveFilter === "active" ? true : empActiveFilter === "inactive" ? false : undefined,
    ).then((r) => r.data),
    enabled: tab === "employees",
    placeholderData: (p) => p,
  });

  const { data: empHistData, isLoading: empHistLoading } = useQuery({
    queryKey: ["admin-emp-history", empHistModal?.id, empHistPage],
    queryFn: () => adminApi.employeeAttendance(empHistModal!.id, empHistPage).then((r) => r.data),
    enabled: !!empHistModal,
    placeholderData: (p) => p,
  });

  // ── Company settings ───────────────────────────────────────
  const { data: companyData, isLoading: companyLoading } = useQuery({
    queryKey: ["admin-company"],
    queryFn: () => adminApi.getCompany().then((r) => r.data),
    enabled: tab === "settings",
  });

  const [companyForm, setCompanyForm] = useState({
    name: "", address: "", lat: "", lng: "",
    radius_meters: "", work_start: "", work_end: "",
    work_saturday: false, work_sunday: false,
    flexible_attendance: false, min_work_hours: "8",
    multi_location: false,
    overtime_enabled: true,
  });

  // Sync form when company data loads or refreshes after save
  useEffect(() => {
    if (!companyData) return;
    setCompanyForm({
      name:          companyData.name ?? "",
      address:       companyData.address ?? "",
      lat:           companyData.lat?.toString() ?? "",
      lng:           companyData.lng?.toString() ?? "",
      radius_meters: companyData.radius_meters?.toString() ?? "",
      work_start:    companyData.work_start?.slice(0, 5) ?? "",
      work_end:      companyData.work_end?.slice(0, 5) ?? "",
      work_saturday: companyData.work_saturday ?? false,
      work_sunday:   companyData.work_sunday ?? false,
      flexible_attendance: companyData.flexible_attendance ?? false,
      min_work_hours: ((companyData.min_work_minutes ?? 480) / 60).toString(),
      multi_location: companyData.multi_location ?? false,
      overtime_enabled: companyData.overtime_enabled ?? true,
    });
  }, [companyData]);

  const saveCompany = useMutation({
    mutationFn: () => {
      const lat = companyForm.lat ? parseFloat(companyForm.lat) : undefined;
      const lng = companyForm.lng ? parseFloat(companyForm.lng) : undefined;
      const radius = companyForm.radius_meters ? parseInt(companyForm.radius_meters) : undefined;
      if (lat !== undefined && isNaN(lat)) throw new Error("Latitude tidak valid");
      if (lng !== undefined && isNaN(lng)) throw new Error("Longitude tidak valid");
      if (radius !== undefined && isNaN(radius)) throw new Error("Radius tidak valid");
      const minHours = parseFloat(companyForm.min_work_hours);
      if (isNaN(minHours) || minHours < 0.5 || minHours > 24) {
        throw new Error("Minimum jam kerja harus 0.5 - 24 jam");
      }
      return adminApi.updateCompany({
        name:          companyForm.name || undefined,
        address:       companyForm.address || undefined,
        lat,
        lng,
        radius_meters: radius,
        work_start:    companyForm.work_start || undefined,
        work_end:      companyForm.work_end || undefined,
        work_saturday: companyForm.work_saturday,
        work_sunday:   companyForm.work_sunday,
        flexible_attendance: companyForm.flexible_attendance,
        min_work_minutes:    Math.round(minHours * 60),
        multi_location:      companyForm.multi_location,
        overtime_enabled:    companyForm.overtime_enabled,
      });
    },
    onSuccess: (res) => {
      toast.success("Pengaturan disimpan!");
      qc.invalidateQueries({ queryKey: ["admin-company"] });
      // Sync auth store so company-dependent UI (e.g. multiLocationOn) updates
      // immediately without requiring a page refresh.
      const updatedCompany = res.data?.data;
      if (updatedCompany) {
        const { profile, setProfile } = useAuthStore.getState();
        if (profile) {
          setProfile({ ...profile, companies: { ...profile.companies, ...updatedCompany } });
        }
      }
    },
    onError: (err) => toast.error("Gagal menyimpan", getErrMsg(err)),
  });

  // ── Locations (multi-location mode) ────────────────────────
  const { data: locationsData, isLoading: locationsLoading } = useQuery({
    queryKey: ["admin-locations"],
    queryFn: () => locationsApi.list().then((r) => r.data),
    enabled: tab === "settings" && companyForm.multi_location,
  });

  const [locModal, setLocModal] = useState<null | {
    id?: string;
    name: string;
    address: string;
    lat: string;
    lng: string;
    radius_meters: string;
  }>(null);

  const saveLocation = useMutation({
    mutationFn: () => {
      if (!locModal) throw new Error("No data");
      const lat = parseFloat(locModal.lat);
      const lng = parseFloat(locModal.lng);
      const radius = parseInt(locModal.radius_meters || "100");
      if (isNaN(lat) || isNaN(lng)) throw new Error("Pilih titik lokasi di peta dulu");
      if (!locModal.name.trim()) throw new Error("Nama lokasi wajib diisi");
      const payload = {
        name: locModal.name.trim(),
        address: locModal.address || undefined,
        lat, lng,
        radius_meters: isNaN(radius) ? 100 : radius,
      };
      return locModal.id
        ? locationsApi.update(locModal.id, payload)
        : locationsApi.create(payload);
    },
    onSuccess: () => {
      toast.success(locModal?.id ? "Lokasi diupdate" : "Lokasi ditambahkan");
      qc.invalidateQueries({ queryKey: ["admin-locations"] });
      setLocModal(null);
    },
    onError: (err) => toast.error("Gagal", getErrMsg(err)),
  });

  const deleteLocation = useMutation({
    mutationFn: (id: string) => locationsApi.remove(id),
    onSuccess: () => {
      toast.success("Lokasi dihapus");
      qc.invalidateQueries({ queryKey: ["admin-locations"] });
    },
    onError: (err) => toast.error("Gagal hapus", getErrMsg(err)),
  });

  // ── Assign employee → locations ────────────────────────────
  const multiLocationOn = !!adminProfile?.companies?.multi_location;
  const [assignLocModal, setAssignLocModal] = useState<null | { user_id: string; name: string; selected: Set<string> }>(null);

  // Locations list — also enable when assign modal is open (so the picker has data)
  const { data: allLocationsData } = useQuery({
    queryKey: ["admin-locations-all"],
    queryFn: () => locationsApi.list().then((r) => r.data),
    enabled: tab === "employees" && multiLocationOn,
  });

  async function openAssignLocations(user_id: string, name: string) {
    try {
      const r = await locationsApi.getForEmployee(user_id);
      setAssignLocModal({ user_id, name, selected: new Set(r.data.location_ids || []) });
    } catch (err) {
      toast.error("Gagal memuat lokasi karyawan", getErrMsg(err));
    }
  }

  const saveAssignLocations = useMutation({
    mutationFn: () =>
      locationsApi.assignToEmployee(assignLocModal!.user_id, Array.from(assignLocModal!.selected)),
    onSuccess: () => {
      toast.success("Lokasi karyawan diupdate");
      setAssignLocModal(null);
    },
    onError: (err) => toast.error("Gagal", getErrMsg(err)),
  });

  // ── Export ─────────────────────────────────────────────────
  const [exportFrom, setExportFrom] = useState("");
  const [exportTo, setExportTo]     = useState("");
  const [exporting,     setExporting]     = useState(false);
  const [leaveExporting, setLeaveExporting] = useState(false);
  const [otExporting,    setOtExporting]    = useState(false);
  const [empExporting,   setEmpExporting]   = useState(false);

  function downloadBlob(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleExport() {
    setExporting(true);
    try {
      const res = await adminApi.exportAttendance(exportFrom || undefined, exportTo || undefined);
      const suffix = exportFrom ? `${exportFrom}_${exportTo || ""}` : "bulan-ini";
      downloadBlob(res.data, `absensi_${suffix}.xlsx`);
      toast.success("Export berhasil!");
    } catch (err) {
      toast.error("Export gagal", getErrMsg(err));
    } finally {
      setExporting(false);
    }
  }

  async function handleLeaveExport() {
    setLeaveExporting(true);
    try {
      const res = await adminApi.exportLeave(leaveFilter || undefined, leaveFrom || undefined, leaveTo || undefined);
      const suffix = leaveFrom ? `${leaveFrom}_${leaveTo || ""}` : "semua";
      downloadBlob(res.data, `cuti_${suffix}.xlsx`);
      toast.success("Export cuti berhasil!");
    } catch (err) {
      toast.error("Export gagal", getErrMsg(err));
    } finally {
      setLeaveExporting(false);
    }
  }

  async function handleOtExport() {
    setOtExporting(true);
    try {
      const res = await adminApi.exportOvertime(otFilter || undefined, otFrom || undefined, otTo || undefined);
      const suffix = otFrom ? `${otFrom}_${otTo || ""}` : "semua";
      downloadBlob(res.data, `lembur_${suffix}.xlsx`);
      toast.success("Export lembur berhasil!");
    } catch (err) {
      toast.error("Export gagal", getErrMsg(err));
    } finally {
      setOtExporting(false);
    }
  }

  async function handleEmpExport() {
    if (!empHistModal) return;
    setEmpExporting(true);
    try {
      const res = await adminApi.exportEmployeeAttendance(empHistModal.id);
      const safeName = empHistModal.name.replace(/\s+/g, "_");
      downloadBlob(res.data, `absensi_${safeName}.xlsx`);
      toast.success("Export berhasil!");
    } catch (err) {
      toast.error("Export gagal", getErrMsg(err));
    } finally {
      setEmpExporting(false);
    }
  }

  // ── Approve mutations ──────────────────────────────────────
  const [reviewModal, setReviewModal] = useState<{
    type: "leave" | "overtime";
    id: string;
    status: "approved" | "rejected";
    name: string;
  } | null>(null);
  const [reviewNote, setReviewNote] = useState("");

  const approveLeave = useMutation({
    mutationFn: ({ id, status, note }: { id: string; status: string; note?: string }) =>
      leaveApi.approve(id, status, note),
    onSuccess: (_, { status }) => {
      toast.success(`Cuti ${status === "approved" ? "disetujui" : "ditolak"}`);
      qc.invalidateQueries({ queryKey: ["admin-leave"] });
      qc.invalidateQueries({ queryKey: ["admin-stats"] });
    },
    onError: (err) => toast.error("Gagal", getErrMsg(err)),
  });

  const approveOt = useMutation({
    mutationFn: ({ id, status, note }: { id: string; status: string; note?: string }) =>
      overtimeApi.approve(id, status, note),
    onSuccess: (_, { status }) => {
      toast.success(`Lembur ${status === "approved" ? "disetujui" : "ditolak"}`);
      qc.invalidateQueries({ queryKey: ["admin-overtime"] });
      qc.invalidateQueries({ queryKey: ["admin-stats"] });
    },
    onError: (err) => toast.error("Gagal", getErrMsg(err)),
  });

  function openReview(type: "leave" | "overtime", id: string, status: "approved" | "rejected", name: string) {
    setReviewNote("");
    setReviewModal({ type, id, status, name });
  }

  function submitReview() {
    if (!reviewModal) return;
    const note = reviewNote.trim() || undefined;
    if (reviewModal.type === "leave") {
      approveLeave.mutate({ id: reviewModal.id, status: reviewModal.status, note });
    } else {
      approveOt.mutate({ id: reviewModal.id, status: reviewModal.status, note });
    }
    setReviewModal(null);
  }

  // ── Employee toggle ────────────────────────────────────────
  const toggleActive = useMutation({
    mutationFn: ({ id, is_active }: { id: string; is_active: boolean }) =>
      adminApi.toggleEmployeeActive(id, is_active),
    onMutate: async ({ id, is_active }) => {
      await qc.cancelQueries({ queryKey: ["admin-employees"] }); // prevent stale overwrites
      const prev = qc.getQueriesData({ queryKey: ["admin-employees"] });
      qc.setQueriesData(
        { queryKey: ["admin-employees"] },
        (old: any) => {
          if (!old?.data) return old;
          return { ...old, data: old.data.map((e: any) => e.id === id ? { ...e, is_active } : e) };
        }
      );
      return { prev };
    },
    onSuccess: (_, { is_active }) => {
      toast.success(is_active ? "Karyawan diaktifkan" : "Karyawan dinonaktifkan");
      qc.invalidateQueries({ queryKey: ["admin-stats"] });
    },
    onError: (err, _, ctx: any) => {
      toast.error("Gagal", getErrMsg(err));
      ctx?.prev?.forEach(([key, data]: [any, any]) => qc.setQueryData(key, data));
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["admin-employees"] });
    },
  });

  const changeRole = useMutation({
    mutationFn: ({ id, role }: { id: string; role: string }) =>
      adminApi.updateEmployeeRole(id, role),
    onMutate: async ({ id, role }) => {
      await qc.cancelQueries({ queryKey: ["admin-employees"] });
      const prev = qc.getQueriesData({ queryKey: ["admin-employees"] });
      qc.setQueriesData(
        { queryKey: ["admin-employees"] },
        (old: any) => {
          if (!old?.data) return old;
          return { ...old, data: old.data.map((e: any) => e.id === id ? { ...e, role } : e) };
        }
      );
      return { prev };
    },
    onSuccess: (_, { role }) => {
      toast.success(`Role diubah ke ${role}`);
    },
    onError: (err, _, ctx: any) => {
      toast.error("Gagal ubah role", getErrMsg(err));
      ctx?.prev?.forEach(([key, data]: [any, any]) => qc.setQueryData(key, data));
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["admin-employees"] });
    },
  });

  function resetPage() { setPage(1); }

  return (
    <div>
      <PageHeader title="Admin Panel" subtitle="Kelola absensi perusahaan" />

      {/* ── Location create/edit modal ── */}
      {locModal && (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/40 backdrop-blur-sm">
          <Card className="w-full md:max-w-md rounded-t-2xl md:rounded-2xl border-0 shadow-xl animate-slide-up max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b border-border sticky top-0 bg-card z-10">
              <h3 className="font-bold text-base">{locModal.id ? "Edit Lokasi" : "Tambah Lokasi"}</h3>
              <button onClick={() => setLocModal(null)} className="text-muted-foreground hover:text-foreground">
                <X className="h-5 w-5" />
              </button>
            </div>
            <CardContent className="p-5 space-y-4">
              <Input
                label="Nama Lokasi"
                placeholder="Contoh: Cabang Jakarta, Toko Bandung"
                value={locModal.name}
                onChange={(e) => setLocModal({ ...locModal, name: e.target.value })}
              />
              <Input
                label="Alamat (opsional)"
                placeholder="Jl. Sudirman No. 1"
                value={locModal.address}
                onChange={(e) => setLocModal({ ...locModal, address: e.target.value })}
              />
              <div>
                <p className="text-sm font-medium mb-2">Titik Lokasi</p>
                <LocationPicker
                  lat={locModal.lat ? parseFloat(locModal.lat) : null}
                  lng={locModal.lng ? parseFloat(locModal.lng) : null}
                  onChange={(lat, lng) => setLocModal({ ...locModal, lat: lat.toString(), lng: lng.toString() })}
                />
              </div>
              <Input
                label="Radius (meter)"
                type="number"
                min="10"
                max="50000"
                placeholder="100"
                value={locModal.radius_meters}
                onChange={(e) => setLocModal({ ...locModal, radius_meters: e.target.value })}
              />
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => setLocModal(null)}>Batal</Button>
                <Button className="flex-1" loading={saveLocation.isPending} onClick={() => saveLocation.mutate()}>
                  {locModal.id ? "Simpan" : "Tambah"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── Assign-locations-to-employee modal ── */}
      {assignLocModal && (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/40 backdrop-blur-sm">
          <Card className="w-full md:max-w-md rounded-t-2xl md:rounded-2xl border-0 shadow-xl animate-slide-up max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between p-5 border-b border-border shrink-0">
              <div>
                <h3 className="font-bold text-base">Atur Lokasi Absensi</h3>
                <p className="text-xs text-muted-foreground mt-0.5">{assignLocModal.name}</p>
              </div>
              <button onClick={() => setAssignLocModal(null)} className="text-muted-foreground hover:text-foreground">
                <X className="h-5 w-5" />
              </button>
            </div>
            <CardContent className="p-5 space-y-3 overflow-y-auto flex-1">
              <p className="text-xs text-muted-foreground bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                Pilih lokasi yang diizinkan untuk karyawan ini absen. Karyawan tanpa lokasi tidak bisa clock-in.
              </p>
              {(allLocationsData?.data ?? []).length === 0 ? (
                <div className="text-center py-6 text-sm text-muted-foreground bg-muted/30 rounded-lg">
                  Belum ada lokasi. Tambahkan lokasi di tab Pengaturan dulu.
                </div>
              ) : (
                <div className="space-y-2">
                  {(allLocationsData?.data ?? []).map((loc: any) => {
                    const checked = assignLocModal.selected.has(loc.id);
                    return (
                      <label
                        key={loc.id}
                        className={cn(
                          "flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors",
                          checked ? "border-primary bg-primary/5" : "border-border hover:bg-muted/30"
                        )}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => {
                            const next = new Set(assignLocModal.selected);
                            if (checked) next.delete(loc.id); else next.add(loc.id);
                            setAssignLocModal({ ...assignLocModal, selected: next });
                          }}
                          className="w-4 h-4 accent-primary"
                        />
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-sm truncate">{loc.name}</p>
                          <p className="text-xs text-muted-foreground truncate">
                            Radius {loc.radius_meters}m{loc.address ? ` · ${loc.address}` : ""}
                          </p>
                        </div>
                      </label>
                    );
                  })}
                </div>
              )}
              <p className="text-xs text-muted-foreground text-center">
                {assignLocModal.selected.size} lokasi dipilih
              </p>
            </CardContent>
            <div className="flex gap-2 p-5 border-t border-border shrink-0">
              <Button variant="outline" className="flex-1" onClick={() => setAssignLocModal(null)}>Batal</Button>
              <Button className="flex-1" loading={saveAssignLocations.isPending} onClick={() => saveAssignLocations.mutate()}>
                Simpan
              </Button>
            </div>
          </Card>
        </div>
      )}

      {/* ── Review modal ── */}
      {reviewModal && (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/40 backdrop-blur-sm">
          <Card className="w-full md:max-w-sm rounded-t-2xl md:rounded-2xl border-0 shadow-xl animate-slide-up">
            <div className="flex items-center justify-between p-5 border-b border-border">
              <div>
                <h3 className="font-bold text-base">
                  {reviewModal.status === "approved" ? "Setujui" : "Tolak"}{" "}
                  {reviewModal.type === "leave" ? "Cuti" : "Lembur"}
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">{reviewModal.name}</p>
              </div>
              <button onClick={() => setReviewModal(null)} className="text-muted-foreground hover:text-foreground">
                <XCircle className="h-5 w-5" />
              </button>
            </div>
            <CardContent className="p-5 space-y-4">
              <Input
                label={`Catatan ${reviewModal.status === "rejected" ? "(wajib untuk penolakan)" : "(opsional)"}`}
                placeholder="Tulis alasan atau catatan..."
                value={reviewNote}
                onChange={(e) => setReviewNote(e.target.value)}
              />
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => setReviewModal(null)}>
                  Batal
                </Button>
                <Button
                  className={cn("flex-1", reviewModal.status === "rejected" && "bg-red-600 hover:bg-red-700")}
                  disabled={reviewModal.status === "rejected" && !reviewNote.trim()}
                  loading={approveLeave.isPending || approveOt.isPending}
                  onClick={submitReview}
                >
                  {reviewModal.status === "approved" ? "Setujui" : "Tolak"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Tab bar */}
      <div className="sticky top-14 md:top-16 z-20 bg-background/95 backdrop-blur border-b border-border">
        <div className="flex overflow-x-auto px-4 md:px-6 gap-0 scrollbar-hide">
          {TABS.filter((t) => t.id !== "overtime" || otEnabled).map(({ id, label, Icon }) => {
            const badge =
              id === "leave"       ? (stats?.pending_leaves      ?? 0)
            : id === "overtime"    ? (stats?.pending_overtime    ?? 0)
            : id === "corrections" ? (stats?.pending_corrections ?? 0)
            : 0;
            return (
              <button
                key={id}
                onClick={() => { setTab(id); resetPage(); setEmpHistModal(null); }}
                className={cn(
                  "relative flex items-center gap-1.5 px-3 py-3 text-xs font-semibold whitespace-nowrap border-b-2 transition-colors shrink-0",
                  tab === id
                    ? "text-primary border-primary"
                    : "text-muted-foreground border-transparent hover:text-foreground"
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {label}
                {badge > 0 && (
                  <span className="absolute top-2 right-0.5 min-w-[16px] h-4 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center px-1">
                    {badge > 99 ? "99+" : badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div className="px-4 md:px-6 py-4 space-y-4">
        {/* ── Overview ── */}
        {tab === "overview" && (
          <div className="space-y-4 animate-fade-in">
            {statsLoading ? (
              <div className="grid grid-cols-2 gap-3">
                {[1,2,3,4].map(i => <CardSkeleton key={i} />)}
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: "Total Karyawan",   value: stats?.total_employees,    Icon: Users,       color: "bg-blue-50 text-blue-600",    show: true },
                  { label: "Hadir Hari Ini",  value: stats?.present_today,      Icon: Clock,       color: "bg-emerald-50 text-emerald-600", show: true },
                  { label: "Cuti Pending",    value: stats?.pending_leaves,     Icon: CalendarOff, color: "bg-amber-50 text-amber-600",  show: true },
                  { label: "Lembur Pending",  value: stats?.pending_overtime,   Icon: Timer,       color: "bg-indigo-50 text-indigo-600", show: otEnabled },
                  { label: "Koreksi Pending", value: stats?.pending_corrections,Icon: Pencil,      color: "bg-rose-50 text-rose-600",    show: true },
                ].filter((item) => item.show).map(({ label, value, Icon, color }) => (
                  <Card key={label} className="card-interactive cursor-pointer">
                    <CardContent className="p-4">
                      <div className={cn("w-9 h-9 rounded-xl flex items-center justify-center mb-3", color)}>
                        <Icon className="h-4 w-4" />
                      </div>
                      <p className="text-2xl font-extrabold text-foreground">{value ?? "—"}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}

            <Card>
              <CardContent className="p-4 text-center text-sm text-muted-foreground space-y-1">
                <p className="font-semibold text-foreground">💡 Tips Admin</p>
                <p>Gunakan tab di atas untuk menyetujui pengajuan cuti & lembur karyawan.</p>
              </CardContent>
            </Card>
          </div>
        )}

        {/* ── Attendance table ── */}
        {tab === "attendance" && (
          <div className="space-y-3 animate-fade-in">
            <div className="flex flex-wrap items-center gap-2">
              <DateRangeFilter
                from={attDateFrom} to={attDateTo}
                onFrom={(v) => { setAttDateFrom(v); setExportFrom(v); resetPage(); }}
                onTo={(v) => { setAttDateTo(v); setExportTo(v); resetPage(); }}
                onClear={() => { setAttDateFrom(""); setAttDateTo(""); setExportFrom(""); setExportTo(""); resetPage(); }}
              />
              <Button size="sm" variant="outline" onClick={handleExport} loading={exporting}>
                <Download className="h-3.5 w-3.5" />
                Export Excel
              </Button>
            </div>

            {/* Total durasi summary */}
            {!attLoading && rowsWithDuration > 0 && (
              <div className="flex items-center gap-3 rounded-xl bg-purple-50 border border-purple-200 px-4 py-3">
                <div className="w-8 h-8 rounded-lg bg-purple-100 flex items-center justify-center shrink-0">
                  <Timer className="h-4 w-4 text-purple-600" />
                </div>
                <div>
                  <p className="text-xs text-purple-700 font-medium">Total Durasi Kerja</p>
                  <p className="text-xs text-purple-500">{rowsWithDuration} dari {attData?.data?.length ?? 0} data di halaman ini</p>
                </div>
                <p className="ml-auto text-xl font-extrabold text-purple-700 font-mono">
                  {fmtDuration(totalWorkMinutes)}
                </p>
              </div>
            )}
            <TableWrapper
              isLoading={attLoading}
              data={attData}
              page={page}
              setPage={setPage}
              cols={["Karyawan", "Tanggal", "Masuk", "Keluar", "Durasi", ...(multiLocationOn ? ["Lokasi"] : []), "Status"]}
              emptyIcon={<Clock className="h-8 w-8 mx-auto mb-2 opacity-30" />}
              emptyText="Belum ada data absensi"
              renderRow={(row: any) => {
                const workMinutes = effectiveMinutes(row);
                const colspan = 6 + (multiLocationOn ? 1 : 0);
                return (
                  <Fragment key={row.id}>
                    <tr className="border-b border-border/50 hover:bg-muted/30">
                      <td className="px-4 py-3 font-medium text-sm">{row.profiles?.full_name ?? "—"}</td>
                      <td className="px-4 py-3 text-xs">{fmtDate(row.date)}</td>
                      <td className="px-4 py-3 font-mono text-xs">{row.clock_in ? fmtTime(row.clock_in) : "—"}</td>
                      <td className="px-4 py-3 font-mono text-xs">{row.clock_out ? fmtTime(row.clock_out) : "—"}</td>
                      <td className="px-4 py-3 font-mono text-xs font-semibold text-purple-600">{workMinutes != null ? fmtDuration(workMinutes) : "—"}</td>
                      {multiLocationOn && (
                        <td className="px-4 py-3 text-xs text-muted-foreground">{row.locations?.name ?? "—"}</td>
                      )}
                      <td className="px-4 py-3"><Badge status={row.status} /></td>
                    </tr>
                    {row.notes && (
                      <tr className="border-b border-border/50 bg-muted/20">
                        <td colSpan={colspan} className="px-4 py-2 text-xs text-muted-foreground"><span className="font-semibold">Catatan:</span> {row.notes}</td>
                      </tr>
                    )}
                  </Fragment>
                );
              }}
              renderCard={(row: any) => {
                const workMinutes = effectiveMinutes(row);
                const hasBreak = row.break_start && row.break_end;
                return (
                  <div key={row.id} className="px-4 py-3 space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-sm truncate">{row.profiles?.full_name ?? "—"}</span>
                      <Badge status={row.status} />
                    </div>
                    <p className="text-xs text-muted-foreground">{fmtDate(row.date)}</p>
                    <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs font-mono">
                      <span>Masuk: <span className="font-semibold">{row.clock_in ? fmtTime(row.clock_in) : "—"}</span></span>
                      <span>Keluar: <span className="font-semibold">{row.clock_out ? fmtTime(row.clock_out) : "—"}</span></span>
                      {workMinutes != null && <span className="text-purple-600 font-bold">{fmtDuration(workMinutes)}</span>}
                    </div>
                    {hasBreak && (
                      <p className="text-xs text-muted-foreground font-mono">
                        Istirahat: <span className="font-semibold">{fmtTime(row.break_start)} – {fmtTime(row.break_end)}</span>
                      </p>
                    )}
                    {multiLocationOn && row.locations?.name && (
                      <p className="text-xs text-muted-foreground">📍 {row.locations.name}</p>
                    )}
                    {row.notes && <p className="text-xs text-muted-foreground truncate">📝 {row.notes}</p>}
                  </div>
                );
              }}
            />
          </div>
        )}

        {/* ── Leave table ── */}
        {tab === "leave" && (
          <div className="space-y-3 animate-fade-in">
            <div className="flex flex-wrap gap-2 items-center">
              <FilterBar
                value={leaveFilter}
                onChange={(v) => { setLeaveFilter(v); resetPage(); }}
                options={[
                  { value: "pending", label: "Pending" },
                  { value: "approved", label: "Disetujui" },
                  { value: "rejected", label: "Ditolak" },
                  { value: "", label: "Semua" },
                ]}
              />
              <DateRangeFilter
                from={leaveFrom} to={leaveTo}
                onFrom={(v) => { setLeaveFrom(v); resetPage(); }}
                onTo={(v) => { setLeaveTo(v); resetPage(); }}
                onClear={() => { setLeaveFrom(""); setLeaveTo(""); resetPage(); }}
              />
              <Button size="sm" variant="outline" onClick={handleLeaveExport} loading={leaveExporting}>
                <Download className="h-3.5 w-3.5" />
                Export Excel
              </Button>
            </div>
            <TableWrapper
              isLoading={leaveLoading}
              data={leaveData}
              page={page}
              setPage={setPage}
              cols={["Karyawan", "Jenis", "Tanggal", "Hari", "Status", "Aksi"]}
              emptyIcon={<CalendarOff className="h-8 w-8 mx-auto mb-2 opacity-30" />}
              emptyText="Tidak ada pengajuan cuti"
              renderRow={(row: any) => (
                <tr key={row.id} className="border-b border-border/50 hover:bg-muted/30">
                  <td className="px-4 py-3 font-medium text-sm">{row.profiles?.full_name ?? "—"}</td>
                  <td className="px-4 py-3 text-xs capitalize">{row.leave_type === "annual" ? "Tahunan" : row.leave_type === "sick" ? "Sakit" : row.leave_type === "personal" ? "Pribadi" : "Lainnya"}</td>
                  <td className="px-4 py-3 text-xs">{fmtDate(row.start_date)}{row.start_date !== row.end_date && ` – ${fmtDate(row.end_date)}`}</td>
                  <td className="px-4 py-3 text-center font-semibold">{row.days_count}</td>
                  <td className="px-4 py-3"><Badge status={row.status} /></td>
                  <td className="px-4 py-3">
                    {row.status === "pending" && (
                      <div className="flex gap-1">
                        <button onClick={() => openReview("leave", row.id, "approved", row.profiles?.full_name ?? "")} className="p-1.5 rounded-lg bg-emerald-50 text-emerald-600 hover:bg-emerald-100 transition-colors" title="Setujui"><CheckCircle2 className="h-4 w-4" /></button>
                        <button onClick={() => openReview("leave", row.id, "rejected", row.profiles?.full_name ?? "")} className="p-1.5 rounded-lg bg-red-50 text-red-600 hover:bg-red-100 transition-colors" title="Tolak"><XCircle className="h-4 w-4" /></button>
                      </div>
                    )}
                  </td>
                </tr>
              )}
              renderCard={(row: any) => (
                <div key={row.id} className="px-4 py-3 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-semibold text-sm truncate flex-1 min-w-0">{row.profiles?.full_name ?? "—"}</span>
                    <Badge status={row.status} />
                  </div>
                  <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                    <span className="capitalize">{row.leave_type === "annual" ? "Cuti Tahunan" : row.leave_type === "sick" ? "Sakit" : row.leave_type === "personal" ? "Keperluan Pribadi" : "Lainnya"}</span>
                    <span>•</span>
                    <span>{row.days_count} hari</span>
                    <span>•</span>
                    <span>{fmtDate(row.start_date)}{row.start_date !== row.end_date && ` – ${fmtDate(row.end_date)}`}</span>
                  </div>
                  {row.reviewer_note && <p className="text-xs text-muted-foreground italic">"{row.reviewer_note}"</p>}
                  {row.status === "pending" && (
                    <div className="flex gap-2 pt-1 border-t border-border/50">
                      <button onClick={() => openReview("leave", row.id, "approved", row.profiles?.full_name ?? "")} className="flex-1 text-xs px-3 py-1.5 rounded-lg font-medium bg-emerald-50 text-emerald-600 hover:bg-emerald-100 inline-flex items-center justify-center gap-1"><CheckCircle2 className="h-3.5 w-3.5" /> Setujui</button>
                      <button onClick={() => openReview("leave", row.id, "rejected", row.profiles?.full_name ?? "")} className="flex-1 text-xs px-3 py-1.5 rounded-lg font-medium bg-red-50 text-red-600 hover:bg-red-100 inline-flex items-center justify-center gap-1"><XCircle className="h-3.5 w-3.5" /> Tolak</button>
                    </div>
                  )}
                </div>
              )}
            />
          </div>
        )}

        {/* ── Overtime table ── */}
        {tab === "overtime" && (
          <div className="space-y-3 animate-fade-in">
            <div className="flex flex-wrap gap-2 items-center">
              <FilterBar
                value={otFilter}
                onChange={(v) => { setOtFilter(v); resetPage(); }}
                options={[
                  { value: "pending", label: "Pending" },
                  { value: "approved", label: "Disetujui" },
                  { value: "rejected", label: "Ditolak" },
                  { value: "", label: "Semua" },
                ]}
              />
              <DateRangeFilter
                from={otFrom} to={otTo}
                onFrom={(v) => { setOtFrom(v); resetPage(); }}
                onTo={(v) => { setOtTo(v); resetPage(); }}
                onClear={() => { setOtFrom(""); setOtTo(""); resetPage(); }}
              />
              <Button size="sm" variant="outline" onClick={handleOtExport} loading={otExporting}>
                <Download className="h-3.5 w-3.5" />
                Export Excel
              </Button>
            </div>
            <TableWrapper
              isLoading={otLoading}
              data={otData}
              page={page}
              setPage={setPage}
              cols={["Karyawan", "Tanggal", "Waktu", "Durasi", "Status", "Aksi"]}
              emptyIcon={<Timer className="h-8 w-8 mx-auto mb-2 opacity-30" />}
              emptyText="Tidak ada pengajuan lembur"
              renderRow={(row: any) => (
                <tr key={row.id} className="border-b border-border/50 hover:bg-muted/30">
                  <td className="px-4 py-3 font-medium text-sm">{row.profiles?.full_name ?? "—"}</td>
                  <td className="px-4 py-3 text-xs">{fmtDate(row.date)}</td>
                  <td className="px-4 py-3 font-mono text-xs">{row.start_time.slice(0,5)} – {row.end_time.slice(0,5)}</td>
                  <td className="px-4 py-3 font-semibold text-amber-600 text-xs">{fmtDuration(row.duration_minutes)}</td>
                  <td className="px-4 py-3"><Badge status={row.status} /></td>
                  <td className="px-4 py-3">
                    {row.status === "pending" && (
                      <div className="flex gap-1">
                        <button onClick={() => openReview("overtime", row.id, "approved", row.profiles?.full_name ?? "")} className="p-1.5 rounded-lg bg-emerald-50 text-emerald-600 hover:bg-emerald-100 transition-colors"><CheckCircle2 className="h-4 w-4" /></button>
                        <button onClick={() => openReview("overtime", row.id, "rejected", row.profiles?.full_name ?? "")} className="p-1.5 rounded-lg bg-red-50 text-red-600 hover:bg-red-100 transition-colors"><XCircle className="h-4 w-4" /></button>
                      </div>
                    )}
                  </td>
                </tr>
              )}
              renderCard={(row: any) => (
                <div key={row.id} className="px-4 py-3 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-semibold text-sm truncate flex-1 min-w-0">{row.profiles?.full_name ?? "—"}</span>
                    <Badge status={row.status} />
                  </div>
                  <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                    <span>{fmtDate(row.date)}</span>
                    <span>•</span>
                    <span className="font-mono">{row.start_time.slice(0,5)} – {row.end_time.slice(0,5)}</span>
                    <span>•</span>
                    <span className="text-amber-600 font-semibold">{fmtDuration(row.duration_minutes)}</span>
                  </div>
                  {row.reviewer_note && <p className="text-xs text-muted-foreground italic">"{row.reviewer_note}"</p>}
                  {row.status === "pending" && (
                    <div className="flex gap-2 pt-1 border-t border-border/50">
                      <button onClick={() => openReview("overtime", row.id, "approved", row.profiles?.full_name ?? "")} className="flex-1 text-xs px-3 py-1.5 rounded-lg font-medium bg-emerald-50 text-emerald-600 hover:bg-emerald-100 inline-flex items-center justify-center gap-1"><CheckCircle2 className="h-3.5 w-3.5" /> Setujui</button>
                      <button onClick={() => openReview("overtime", row.id, "rejected", row.profiles?.full_name ?? "")} className="flex-1 text-xs px-3 py-1.5 rounded-lg font-medium bg-red-50 text-red-600 hover:bg-red-100 inline-flex items-center justify-center gap-1"><XCircle className="h-3.5 w-3.5" /> Tolak</button>
                    </div>
                  )}
                </div>
              )}
            />
          </div>
        )}

        {/* ── Corrections ── */}
        {tab === "corrections" && (
          <div className="space-y-3 animate-fade-in">
            <div className="flex flex-wrap gap-2 items-center">
              <FilterBar
                value={corrFilter}
                onChange={(v) => { setCorrFilter(v); resetPage(); }}
                options={[
                  { value: "pending",  label: "Pending" },
                  { value: "approved", label: "Disetujui" },
                  { value: "rejected", label: "Ditolak" },
                  { value: "",         label: "Semua" },
                ]}
              />
              <DateRangeFilter
                from={corrFrom} to={corrTo}
                onFrom={(v) => { setCorrFrom(v); resetPage(); }}
                onTo={(v) => { setCorrTo(v); resetPage(); }}
                onClear={() => { setCorrFrom(""); setCorrTo(""); resetPage(); }}
              />
            </div>
            <TableWrapper
              isLoading={corrLoading}
              data={corrData}
              page={page}
              setPage={setPage}
              cols={["Karyawan", "Tgl Absen", "Masuk Baru", "Keluar Baru", "Alasan", "Status", "Aksi"]}
              emptyIcon={<Pencil className="h-8 w-8 mx-auto mb-2 opacity-30" />}
              emptyText="Tidak ada pengajuan koreksi"
              renderRow={(row: any) => (
                <tr key={row.id} className="border-b border-border/50 hover:bg-muted/30">
                  <td className="px-4 py-3 font-medium text-sm">{row.profiles?.full_name ?? "—"}</td>
                  <td className="px-4 py-3 text-xs">{fmtDate(row.attendance?.date)}</td>
                  <td className="px-4 py-3 font-mono text-xs text-indigo-600">{row.requested_clock_in ? fmtTime(row.requested_clock_in) : "—"}</td>
                  <td className="px-4 py-3 font-mono text-xs text-indigo-600">{row.requested_clock_out ? fmtTime(row.requested_clock_out) : "—"}</td>
                  <td className="px-4 py-3 text-xs max-w-[120px]">
                    <button
                      onClick={() => setReasonModal(row.reason)}
                      className="truncate block max-w-[120px] text-left hover:text-primary hover:underline transition-colors"
                      title="Klik untuk lihat selengkapnya"
                    >
                      {row.reason}
                    </button>
                  </td>
                  <td className="px-4 py-3"><Badge status={row.status} /></td>
                  <td className="px-4 py-3">
                    {row.status === "pending" && (
                      <div className="flex gap-1">
                        <button onClick={() => approveCorr.mutate({ id: row.id, status: "approved" })} disabled={approveCorr.isPending} className="p-1.5 rounded-lg bg-emerald-50 text-emerald-600 hover:bg-emerald-100 transition-colors" title="Setujui"><CheckCircle2 className="h-4 w-4" /></button>
                        <button onClick={() => approveCorr.mutate({ id: row.id, status: "rejected" })} disabled={approveCorr.isPending} className="p-1.5 rounded-lg bg-red-50 text-red-600 hover:bg-red-100 transition-colors" title="Tolak"><XCircle className="h-4 w-4" /></button>
                      </div>
                    )}
                  </td>
                </tr>
              )}
              renderCard={(row: any) => (
                <div key={row.id} className="px-4 py-3 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-semibold text-sm truncate flex-1 min-w-0">{row.profiles?.full_name ?? "—"}</span>
                    <Badge status={row.status} />
                  </div>
                  <p className="text-xs text-muted-foreground">{fmtDate(row.attendance?.date)}</p>
                  <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs font-mono">
                    {row.requested_clock_in && <span>Masuk → <span className="text-indigo-600 font-semibold">{fmtTime(row.requested_clock_in)}</span></span>}
                    {row.requested_clock_out && <span>Keluar → <span className="text-indigo-600 font-semibold">{fmtTime(row.requested_clock_out)}</span></span>}
                  </div>
                  <button
                    onClick={() => setReasonModal(row.reason)}
                    className="text-xs text-muted-foreground text-left hover:text-primary transition-colors line-clamp-2"
                    title="Klik untuk lihat selengkapnya"
                  >
                    {row.reason}
                  </button>
                  {row.status === "pending" && (
                    <div className="flex gap-2 pt-1 border-t border-border/50">
                      <button onClick={() => approveCorr.mutate({ id: row.id, status: "approved" })} disabled={approveCorr.isPending} className="flex-1 text-xs px-3 py-1.5 rounded-lg font-medium bg-emerald-50 text-emerald-600 hover:bg-emerald-100 inline-flex items-center justify-center gap-1 disabled:opacity-50"><CheckCircle2 className="h-3.5 w-3.5" /> Setujui</button>
                      <button onClick={() => approveCorr.mutate({ id: row.id, status: "rejected" })} disabled={approveCorr.isPending} className="flex-1 text-xs px-3 py-1.5 rounded-lg font-medium bg-red-50 text-red-600 hover:bg-red-100 inline-flex items-center justify-center gap-1 disabled:opacity-50"><XCircle className="h-3.5 w-3.5" /> Tolak</button>
                    </div>
                  )}
                </div>
              )}
            />
          </div>
        )}

        {/* ── Employees ── */}
        {tab === "employees" && (
          <div className="space-y-3 animate-fade-in">
            {/* Search + filter bar */}
            <div className="flex gap-2 items-center">
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <input
                  type="search"
                  placeholder="Cari nama karyawan..."
                  value={empSearch}
                  onChange={(e) => { setEmpSearch(e.target.value); resetPage(); }}
                  className="w-full h-8 pl-8 pr-3 rounded-lg border border-border bg-background text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                />
                {empSearch && (
                  <button
                    onClick={() => { setEmpSearch(""); resetPage(); }}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
              <FilterBar
                value={empActiveFilter}
                onChange={(v) => { setEmpActiveFilter(v as any); resetPage(); }}
                options={[
                  { value: "all",      label: "Semua" },
                  { value: "active",   label: "Aktif" },
                  { value: "inactive", label: "Nonaktif" },
                ]}
              />
            </div>

            <TableWrapper
              isLoading={empLoading}
              data={empData}
              page={page}
              setPage={setPage}
              cols={["Nama", "Email", "Jabatan", "Role", "HP", "Aksi"]}
              emptyIcon={<Users className="h-8 w-8 mx-auto mb-2 opacity-30" />}
              emptyText="Belum ada karyawan"
              renderRow={(row: any) => (
                <tr key={row.id} className={cn("border-b border-border/50 hover:bg-muted/30", !row.is_active && "opacity-50")}>
                  <td className="px-4 py-3 font-medium text-sm">
                    <button onClick={() => { setEmpHistModal({ id: row.id, name: row.full_name }); setEmpHistPage(1); }} className="text-left hover:text-primary hover:underline transition-colors">
                      {row.full_name}
                    </button>
                    {!row.is_active && <span className="ml-1.5 text-[10px] text-red-500 font-normal">(nonaktif)</span>}
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground max-w-[220px] truncate" title={row.email ?? ""}>{row.email ?? "—"}</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{row.position ?? "—"}</td>
                  <td className="px-4 py-3">
                    <select value={row.role} onChange={(e) => changeRole.mutate({ id: row.id, role: e.target.value })} disabled={row.id === adminProfile?.id} className="text-xs border border-border rounded-lg px-2 py-0.5 bg-background focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50 disabled:cursor-not-allowed">
                      <option value="employee">employee</option>
                      <option value="admin">admin</option>
                    </select>
                  </td>
                  <td className="px-4 py-3 text-xs font-mono">{row.phone ?? "—"}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      {multiLocationOn && (
                        <button
                          onClick={() => openAssignLocations(row.id, row.full_name)}
                          className="text-xs px-2 py-1 rounded-lg font-medium bg-indigo-50 text-indigo-600 hover:bg-indigo-100 inline-flex items-center gap-1"
                          title="Atur lokasi absen karyawan"
                        >
                          <MapPin className="h-3 w-3" /> Lokasi
                        </button>
                      )}
                      {row.id !== adminProfile?.id && !IS_DEMO && (
                        <button onClick={() => toggleActive.mutate({ id: row.id, is_active: !row.is_active })} className={cn("text-xs px-2 py-1 rounded-lg font-medium transition-colors", row.is_active ? "bg-red-50 text-red-600 hover:bg-red-100" : "bg-emerald-50 text-emerald-600 hover:bg-emerald-100")}>
                          {row.is_active ? "Nonaktifkan" : "Aktifkan"}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              )}
              renderCard={(row: any) => {
                const hasActions = multiLocationOn || (row.id !== adminProfile?.id && !IS_DEMO);
                return (
                  <div key={row.id} className={cn("px-4 py-3 space-y-2.5", !row.is_active && "opacity-60")}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <button onClick={() => { setEmpHistModal({ id: row.id, name: row.full_name }); setEmpHistPage(1); }} className="font-semibold text-sm text-left hover:text-primary truncate block w-full">
                          {row.full_name}
                        </button>
                        <p className="text-xs text-muted-foreground truncate mt-0.5">{row.position ?? "—"}</p>
                      </div>
                      <span className={cn("text-[10px] px-2 py-0.5 rounded-full font-medium shrink-0", row.is_active !== false ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-600")}>
                        {row.is_active !== false ? "Aktif" : "Nonaktif"}
                      </span>
                    </div>

                    {/* Contact info — email + phone, mobile-friendly stack */}
                    {(row.email || row.phone) && (
                      <div className="space-y-1 text-xs">
                        {row.email && (
                          <div className="flex items-center gap-1.5 text-muted-foreground min-w-0">
                            <Mail className="h-3 w-3 shrink-0" />
                            <span className="truncate" title={row.email}>{row.email}</span>
                          </div>
                        )}
                        {row.phone && (
                          <div className="flex items-center gap-1.5 text-muted-foreground font-mono">
                            <Phone className="h-3 w-3 shrink-0" />
                            <span>{row.phone}</span>
                          </div>
                        )}
                      </div>
                    )}

                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-muted-foreground uppercase tracking-wide">Role</span>
                      <select value={row.role} onChange={(e) => changeRole.mutate({ id: row.id, role: e.target.value })} disabled={row.id === adminProfile?.id} className="text-xs border border-border rounded-lg px-2 py-1 bg-background focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50 disabled:cursor-not-allowed">
                        <option value="employee">employee</option>
                        <option value="admin">admin</option>
                      </select>
                    </div>
                    {hasActions && (
                      <div className="flex items-center gap-2 pt-1 border-t border-border/50">
                        {multiLocationOn && (
                          <button
                            onClick={() => openAssignLocations(row.id, row.full_name)}
                            className="flex-1 text-xs px-3 py-1.5 rounded-lg font-medium bg-indigo-50 text-indigo-600 hover:bg-indigo-100 inline-flex items-center justify-center gap-1"
                          >
                            <MapPin className="h-3 w-3" /> Lokasi
                          </button>
                        )}
                        {row.id !== adminProfile?.id && !IS_DEMO && (
                          <button onClick={() => toggleActive.mutate({ id: row.id, is_active: !row.is_active })} className={cn("flex-1 text-xs px-3 py-1.5 rounded-lg font-medium transition-colors", row.is_active !== false ? "bg-red-50 text-red-600 hover:bg-red-100" : "bg-emerald-50 text-emerald-600 hover:bg-emerald-100")}>
                            {row.is_active !== false ? "Nonaktifkan" : "Aktifkan"}
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                );
              }}
            />
          </div>
        )}

        {/* ── Employee attendance history modal ── */}
        {empHistModal && (
          <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/40 backdrop-blur-sm">
            <div className="w-full md:max-w-2xl bg-card rounded-t-2xl md:rounded-2xl shadow-xl flex flex-col max-h-[80vh]">
              <div className="flex items-center justify-between p-5 border-b border-border shrink-0">
                <div>
                  <h3 className="font-bold text-base">Riwayat Absensi</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">{empHistModal.name}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Button size="sm" variant="outline" onClick={handleEmpExport} loading={empExporting}>
                    <Download className="h-3.5 w-3.5" />
                    Export
                  </Button>
                  <button onClick={() => setEmpHistModal(null)} className="text-muted-foreground hover:text-foreground">
                    <X className="h-5 w-5" />
                  </button>
                </div>
              </div>
              <div className="overflow-auto flex-1">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-muted/90">
                    <tr className="border-b border-border">
                      {["Tanggal", "Masuk", "Keluar", "Durasi", "Status"].map((h) => (
                        <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {empHistLoading
                      ? Array.from({ length: 5 }).map((_, i) => <TableRowSkeleton key={i} cols={5} />)
                      : !empHistData?.data?.length
                      ? (
                        <tr>
                          <td colSpan={5} className="text-center py-10 text-muted-foreground text-sm">
                            <Clock className="h-8 w-8 mx-auto mb-2 opacity-30" />
                            Belum ada data absensi
                          </td>
                        </tr>
                      )
                      : empHistData.data.map((row: any) => {
                        const mins = effectiveMinutes(row);
                        return (
                          <tr key={row.id} className="border-b border-border/50 hover:bg-muted/20">
                            <td className="px-4 py-3 text-xs font-medium">{fmtDate(row.date)}</td>
                            <td className="px-4 py-3 font-mono text-xs">{row.clock_in ? fmtTime(row.clock_in) : "—"}</td>
                            <td className="px-4 py-3 font-mono text-xs">{row.clock_out ? fmtTime(row.clock_out) : "—"}</td>
                            <td className="px-4 py-3 text-xs text-purple-600 font-mono">{mins != null ? fmtDuration(mins) : "—"}</td>
                            <td className="px-4 py-3"><Badge status={row.status} /></td>
                          </tr>
                        );
                      })
                    }
                  </tbody>
                </table>
              </div>
              {/* Pagination */}
              {(empHistData?.total ?? 0) > 20 && (
                <div className="flex items-center justify-between px-5 py-3 border-t border-border shrink-0">
                  <p className="text-xs text-muted-foreground">
                    Halaman {empHistPage} dari {Math.ceil((empHistData?.total ?? 0) / 20)}
                  </p>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => setEmpHistPage((p) => Math.max(1, p - 1))} disabled={empHistPage === 1}>
                      <ChevronLeft className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setEmpHistPage((p) => p + 1)} disabled={empHistPage >= Math.ceil((empHistData?.total ?? 0) / 20)}>
                      <ChevronRight className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Monthly Report ── */}
        {tab === "report" && (
          <div className="space-y-4 animate-fade-in">
            {/* Month picker + export */}
            <div className="flex items-center gap-2 flex-wrap">
              <input
                type="month"
                value={`${reportYear}-${String(reportMonth).padStart(2, "0")}`}
                onChange={(e) => {
                  const [y, m] = e.target.value.split("-").map(Number);
                  setReportYear(y);
                  setReportMonth(m);
                }}
                className="h-8 rounded-lg border border-border bg-background px-2 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
              />
              <span className="text-xs text-muted-foreground flex-1">
                {reportData ? `${reportData.data.length} karyawan` : ""}
              </span>
              <Button
                size="sm"
                variant="outline"
                loading={exporting}
                onClick={async () => {
                  setExporting(true);
                  try {
                    const res = await adminApi.exportMonthlyReport(reportYear, reportMonth);
                    downloadBlob(res.data, `rekap_${reportYear}_${String(reportMonth).padStart(2, "0")}.xlsx`);
                    toast.success("Export rekap berhasil!");
                  } catch (err) {
                    toast.error("Export gagal", getErrMsg(err));
                  } finally {
                    setExporting(false);
                  }
                }}
              >
                <Download className="h-3.5 w-3.5" />
                Export Excel
              </Button>
            </div>

            <div className="rounded-2xl border border-border bg-card overflow-hidden shadow-card">
              {/* Mobile: card list */}
              <div className="md:hidden divide-y divide-border">
                {reportLoading
                  ? <div className="p-4 space-y-3">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-24 bg-muted rounded-xl animate-pulse" />)}</div>
                  : !reportData?.data?.length
                  ? <div className="py-12 text-center text-muted-foreground text-sm"><BarChart2 className="h-8 w-8 mx-auto mb-2 opacity-30" />Tidak ada data untuk bulan ini</div>
                  : reportData.data.map((row: any) => (
                    <div key={row.user_id} className="px-4 py-3 space-y-2">
                      <div>
                        <p className="font-semibold text-sm">{row.full_name}</p>
                        {row.position && <p className="text-xs text-muted-foreground">{row.position}</p>}
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        <div className="bg-emerald-50 rounded-lg px-2 py-1.5 text-center">
                          <p className="text-lg font-bold text-emerald-600">{row.hadir}</p>
                          <p className="text-[10px] text-emerald-700">Hadir</p>
                        </div>
                        <div className="bg-blue-50 rounded-lg px-2 py-1.5 text-center">
                          <p className="text-lg font-bold text-blue-600">{row.cuti_days}</p>
                          <p className="text-[10px] text-blue-700">Cuti</p>
                        </div>
                        <div className="bg-purple-50 rounded-lg px-2 py-1.5 text-center">
                          <p className="text-lg font-bold text-purple-600 font-mono text-sm">{row.work_minutes > 0 ? fmtDuration(row.work_minutes) : "—"}</p>
                          <p className="text-[10px] text-purple-700">Total Jam</p>
                        </div>
                      </div>
                      {row.lembur_minutes > 0 && (
                        <p className="text-xs text-amber-600 font-mono">Lembur: {fmtDuration(row.lembur_minutes)}</p>
                      )}
                    </div>
                  ))
                }
              </div>

              {/* Desktop: table */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-muted/50 border-b border-border">
                      {["Karyawan", "Jabatan", "Hadir", "Cuti", "Lembur", "Total Jam"].map((h) => (
                        <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide whitespace-nowrap">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {reportLoading
                      ? Array.from({ length: 5 }).map((_, i) => (
                          <tr key={i} className="border-b border-border/50">
                            {Array.from({ length: 6 }).map((_, j) => (
                              <td key={j} className="px-4 py-3">
                                <div className="h-3 bg-muted rounded animate-pulse w-16" />
                              </td>
                            ))}
                          </tr>
                        ))
                      : !reportData?.data?.length
                      ? (
                        <tr>
                          <td colSpan={6} className="text-center py-12 text-muted-foreground text-sm">
                            <BarChart2 className="h-8 w-8 mx-auto mb-2 opacity-30" />
                            Tidak ada data untuk bulan ini
                          </td>
                        </tr>
                      )
                      : reportData.data.map((row: any) => (
                        <tr key={row.user_id} className="border-b border-border/50 hover:bg-muted/30">
                          <td className="px-4 py-3 font-medium text-sm">{row.full_name}</td>
                          <td className="px-4 py-3 text-xs text-muted-foreground">{row.position ?? "—"}</td>
                          <td className="px-4 py-3 text-center">
                            <span className="font-bold text-emerald-600">{row.hadir}</span>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span className="font-semibold text-blue-600">{row.cuti_days}</span>
                          </td>
                          <td className="px-4 py-3 text-xs font-mono text-amber-600">
                            {row.lembur_minutes > 0 ? fmtDuration(row.lembur_minutes) : "—"}
                          </td>
                          <td className="px-4 py-3 text-xs font-mono font-semibold text-purple-600">
                            {row.work_minutes > 0 ? fmtDuration(row.work_minutes) : "—"}
                          </td>
                        </tr>
                      ))
                    }
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ── Settings ── */}
        {tab === "settings" && (
          <div className="space-y-4 animate-fade-in max-w-lg mx-auto">
            {companyLoading ? (
              <div className="space-y-4">
                {[1, 2, 3].map((i) => (
                  <Card key={i}>
                    <CardContent className="p-5 space-y-3">
                      <div className="h-4 bg-muted rounded animate-pulse w-32" />
                      <div className="h-10 bg-muted rounded-lg animate-pulse" />
                      <div className="h-10 bg-muted rounded-lg animate-pulse" />
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <>
                {/* Company info */}
                <Card>
                  <CardContent className="p-5 space-y-4">
                    <p className="text-sm font-semibold text-foreground">Informasi Perusahaan</p>

                    {/* Kode perusahaan — read only */}
                    {companyData?.code && (
                      <div className="flex items-center justify-between rounded-xl bg-indigo-50 border border-indigo-100 px-4 py-3">
                        <div>
                          <p className="text-xs text-indigo-500 font-medium">Kode Perusahaan</p>
                          <p className="text-lg font-extrabold text-indigo-700 tracking-widest font-mono">{companyData.code}</p>
                        </div>
                        <p className="text-xs text-indigo-400 text-right max-w-[140px] leading-relaxed">Bagikan ke karyawan untuk bergabung</p>
                      </div>
                    )}

                    <Input
                      label="Nama Perusahaan"
                      value={companyForm.name}
                      onChange={(e) => setCompanyForm({ ...companyForm, name: e.target.value })}
                    />
                    <Input
                      label="Alamat"
                      value={companyForm.address}
                      onChange={(e) => setCompanyForm({ ...companyForm, address: e.target.value })}
                    />
                  </CardContent>
                </Card>

                {/* Office location */}
                <Card>
                  <CardContent className="p-5 space-y-4">
                    <p className="text-sm font-semibold text-foreground">Lokasi Kantor</p>
                    <LocationPicker
                      lat={companyForm.lat ? parseFloat(companyForm.lat) : null}
                      lng={companyForm.lng ? parseFloat(companyForm.lng) : null}
                      onChange={(lat, lng) => setCompanyForm({ ...companyForm, lat: lat.toString(), lng: lng.toString() })}
                    />
                    <Input
                      label="Radius Absensi (meter)"
                      type="number"
                      min="10"
                      max="50000"
                      placeholder="100"
                      value={companyForm.radius_meters}
                      onChange={(e) => setCompanyForm({ ...companyForm, radius_meters: e.target.value })}
                    />
                    {companyForm.radius_meters && (
                      <p className="text-xs text-muted-foreground">
                        Karyawan harus berada dalam radius <span className="font-semibold text-foreground">{companyForm.radius_meters}m</span> dari koordinat kantor untuk bisa absen.
                      </p>
                    )}
                  </CardContent>
                </Card>

                {/* Work hours */}
                <Card>
                  <CardContent className="p-5 space-y-4">
                    <p className="text-sm font-semibold text-foreground">Jam Kerja</p>
                    <div className="grid grid-cols-2 gap-3">
                      <Input
                        label="Jam Masuk"
                        type="time"
                        value={companyForm.work_start}
                        onChange={(e) => setCompanyForm({ ...companyForm, work_start: e.target.value })}
                      />
                      <Input
                        label="Jam Pulang"
                        type="time"
                        value={companyForm.work_end}
                        onChange={(e) => setCompanyForm({ ...companyForm, work_end: e.target.value })}
                      />
                    </div>
                    {companyForm.work_start && companyForm.work_end && (
                      <p className="text-xs text-muted-foreground">
                        Jam kerja: <span className="font-semibold text-foreground">{companyForm.work_start} – {companyForm.work_end}</span>
                      </p>
                    )}
                    <div className="space-y-2 pt-1">
                      <p className="text-xs font-medium text-foreground/70">Hari Kerja Tambahan</p>
                      {([
                        { key: "work_saturday", label: "Sabtu termasuk hari kerja" },
                        { key: "work_sunday",   label: "Minggu termasuk hari kerja" },
                      ] as const).map(({ key, label }) => (
                        <button
                          key={key}
                          type="button"
                          onClick={() => setCompanyForm((f) => ({ ...f, [key]: !f[key] }))}
                          className="flex items-center gap-3 w-full text-left"
                        >
                          <div className={cn(
                            "w-10 h-6 rounded-full transition-colors flex items-center px-0.5 shrink-0",
                            companyForm[key] ? "bg-primary" : "bg-muted"
                          )}>
                            <div className={cn(
                              "w-5 h-5 rounded-full bg-white shadow transition-transform",
                              companyForm[key] ? "translate-x-4" : "translate-x-0"
                            )} />
                          </div>
                          <span className="text-sm text-foreground">{label}</span>
                        </button>
                      ))}
                    </div>
                  </CardContent>
                </Card>

                {/* Multi-location */}
                <Card>
                  <CardContent className="p-5 space-y-4">
                    <p className="text-sm font-semibold text-foreground">Mode Multi-Lokasi</p>
                    <p className="text-xs text-muted-foreground -mt-2">
                      Aktifkan untuk perusahaan dengan lebih dari 1 cabang/titik absensi.
                      Setiap karyawan bisa di-assign ke beberapa titik tertentu saja.
                    </p>
                    <button
                      type="button"
                      onClick={() => setCompanyForm((f) => ({ ...f, multi_location: !f.multi_location }))}
                      className="flex items-center gap-3 w-full text-left"
                    >
                      <div className={cn(
                        "w-10 h-6 rounded-full transition-colors flex items-center px-0.5 shrink-0",
                        companyForm.multi_location ? "bg-primary" : "bg-muted"
                      )}>
                        <div className={cn(
                          "w-5 h-5 rounded-full bg-white shadow transition-transform",
                          companyForm.multi_location ? "translate-x-4" : "translate-x-0"
                        )} />
                      </div>
                      <span className="text-sm text-foreground">Aktifkan mode multi-lokasi</span>
                    </button>

                    {companyForm.multi_location && (
                      <div className="pt-2 border-t border-border space-y-3">
                        <div className="flex items-center justify-between">
                          <p className="text-xs font-semibold text-foreground/70">Daftar Lokasi Absensi</p>
                          <Button
                            size="sm"
                            onClick={() => setLocModal({
                              name: "", address: "",
                              lat: companyForm.lat || "", lng: companyForm.lng || "",
                              radius_meters: companyForm.radius_meters || "100",
                            })}
                          >
                            + Tambah Lokasi
                          </Button>
                        </div>

                        {locationsLoading ? (
                          <div className="space-y-2">
                            {[1,2].map(i => <div key={i} className="h-14 bg-muted rounded-lg animate-pulse" />)}
                          </div>
                        ) : (locationsData?.data ?? []).length === 0 ? (
                          <div className="text-center py-6 text-sm text-muted-foreground bg-muted/30 rounded-lg">
                            Belum ada lokasi. Klik "+ Tambah Lokasi" untuk mulai.
                          </div>
                        ) : (
                          <div className="space-y-2">
                            {(locationsData?.data ?? []).map((loc: any) => (
                              <div key={loc.id} className="flex items-center gap-3 p-3 rounded-lg border border-border bg-card">
                                <div className="w-9 h-9 rounded-lg bg-indigo-50 flex items-center justify-center shrink-0">
                                  <MapPin className="w-4 h-4 text-indigo-600" />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="font-semibold text-sm truncate">{loc.name}</p>
                                  <p className="text-xs text-muted-foreground truncate">
                                    Radius {loc.radius_meters}m
                                    {loc.address ? ` · ${loc.address}` : ""}
                                  </p>
                                </div>
                                <div className="flex gap-1 shrink-0">
                                  <button
                                    onClick={() => setLocModal({
                                      id: loc.id,
                                      name: loc.name,
                                      address: loc.address ?? "",
                                      lat: loc.lat?.toString() ?? "",
                                      lng: loc.lng?.toString() ?? "",
                                      radius_meters: loc.radius_meters?.toString() ?? "100",
                                    })}
                                    className="p-1.5 rounded-lg bg-indigo-50 text-indigo-600 hover:bg-indigo-100"
                                    title="Edit"
                                  >
                                    <Pencil className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    onClick={() => {
                                      if (confirm(`Hapus lokasi "${loc.name}"?`)) deleteLocation.mutate(loc.id);
                                    }}
                                    className="p-1.5 rounded-lg bg-red-50 text-red-600 hover:bg-red-100"
                                    title="Hapus"
                                  >
                                    <X className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}

                        <p className="text-xs text-muted-foreground">
                          💡 Setelah menambah lokasi, jangan lupa atur lokasi yang diizinkan
                          untuk tiap karyawan di tab <strong>Karyawan</strong>.
                        </p>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Flexible attendance */}
                <Card>
                  <CardContent className="p-5 space-y-4">
                    <p className="text-sm font-semibold text-foreground">Mode Absensi Fleksibel</p>
                    <p className="text-xs text-muted-foreground -mt-2">
                      Karyawan bisa clock-in, istirahat, kembali kerja, lalu clock-out (4 kali absen).
                      Status hadir dihitung dari total durasi kerja efektif.
                    </p>
                    <button
                      type="button"
                      onClick={() => setCompanyForm((f) => ({ ...f, flexible_attendance: !f.flexible_attendance }))}
                      className="flex items-center gap-3 w-full text-left"
                    >
                      <div className={cn(
                        "w-10 h-6 rounded-full transition-colors flex items-center px-0.5 shrink-0",
                        companyForm.flexible_attendance ? "bg-primary" : "bg-muted"
                      )}>
                        <div className={cn(
                          "w-5 h-5 rounded-full bg-white shadow transition-transform",
                          companyForm.flexible_attendance ? "translate-x-4" : "translate-x-0"
                        )} />
                      </div>
                      <span className="text-sm text-foreground">Aktifkan mode fleksibel</span>
                    </button>

                    {companyForm.flexible_attendance && (
                      <>
                        <Input
                          label="Minimum Jam Kerja (jam)"
                          type="number"
                          step="0.5"
                          min="0.5"
                          max="24"
                          placeholder="8"
                          value={companyForm.min_work_hours}
                          onChange={(e) => setCompanyForm({ ...companyForm, min_work_hours: e.target.value })}
                        />
                        <p className="text-xs text-muted-foreground">
                          Karyawan dianggap <span className="font-semibold text-foreground">hadir</span> jika total durasi kerja
                          (clock_in → istirahat) + (istirahat selesai → clock_out) mencapai{" "}
                          <span className="font-semibold text-foreground">{companyForm.min_work_hours || "8"} jam</span>.
                          Kurang dari itu akan dianggap pulang lebih awal.
                        </p>
                      </>
                    )}
                  </CardContent>
                </Card>

                {/* Overtime feature toggle */}
                <Card>
                  <CardContent className="p-5 space-y-4">
                    <p className="text-sm font-semibold text-foreground">Fitur Lembur</p>
                    <p className="text-xs text-muted-foreground -mt-2">
                      Aktifkan jika perusahaan menerapkan kebijakan lembur. Jika dinonaktifkan,
                      menu Lembur akan disembunyikan dari semua karyawan.
                    </p>
                    <button
                      type="button"
                      onClick={() => setCompanyForm((f) => ({ ...f, overtime_enabled: !f.overtime_enabled }))}
                      className="flex items-center gap-3 w-full text-left"
                    >
                      <div className={cn(
                        "w-10 h-6 rounded-full transition-colors flex items-center px-0.5 shrink-0",
                        companyForm.overtime_enabled ? "bg-primary" : "bg-muted"
                      )}>
                        <div className={cn(
                          "w-5 h-5 rounded-full bg-white shadow transition-transform",
                          companyForm.overtime_enabled ? "translate-x-4" : "translate-x-0"
                        )} />
                      </div>
                      <span className="text-sm text-foreground">Aktifkan fitur lembur</span>
                    </button>
                  </CardContent>
                </Card>

                {IS_DEMO ? (
                  <div className="w-full text-center text-sm text-muted-foreground py-3 border border-dashed border-border rounded-xl">
                    Pengaturan perusahaan tidak dapat diubah di mode demo
                  </div>
                ) : (
                  <Button
                    className="w-full"
                    size="lg"
                    loading={saveCompany.isPending}
                    onClick={() => saveCompany.mutate()}
                  >
                    Simpan Pengaturan
                  </Button>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* Reason detail popup */}
      {reasonModal !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={() => setReasonModal(null)}>
          <div className="bg-background rounded-2xl shadow-xl w-full max-w-sm p-5 space-y-3" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-sm">Alasan Koreksi</h3>
              <button onClick={() => setReasonModal(null)} className="text-muted-foreground hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="text-sm text-foreground whitespace-pre-wrap break-words">{reasonModal}</p>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Shared sub-components ───────────────────────────────────────────────────

function FilterBar({
  value, onChange, options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="flex gap-2 overflow-x-auto pb-1">
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "px-3 py-1.5 rounded-full text-xs font-medium border shrink-0 transition-all",
            value === o.value
              ? "bg-primary text-white border-primary"
              : "border-border text-muted-foreground hover:border-primary/50"
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function DateRangeFilter({
  from, to, onFrom, onTo, onClear,
}: {
  from: string; to: string;
  onFrom: (v: string) => void;
  onTo: (v: string) => void;
  onClear: () => void;
}) {
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      <input
        type="date"
        value={from}
        onChange={(e) => onFrom(e.target.value)}
        className="h-7 rounded-lg border border-border bg-background px-2 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
      />
      <span className="text-xs text-muted-foreground">–</span>
      <input
        type="date"
        value={to}
        min={from}
        onChange={(e) => onTo(e.target.value)}
        className="h-7 rounded-lg border border-border bg-background px-2 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
      />
      {(from || to) && (
        <button onClick={onClear} className="text-xs text-muted-foreground hover:text-foreground px-1.5 py-0.5 rounded border border-border">
          <X className="h-3 w-3" />
        </button>
      )}
    </div>
  );
}

function TableWrapper({
  isLoading, data, page, setPage, cols, emptyIcon, emptyText, renderRow, renderCard,
}: {
  isLoading: boolean;
  data: any;
  page: number;
  setPage: (p: number) => void;
  cols: string[];
  emptyIcon: React.ReactNode;
  emptyText: string;
  renderRow: (row: any) => React.ReactNode;
  renderCard?: (row: any) => React.ReactNode;
}) {
  const totalPages = data ? Math.ceil(data.total / (data.per_page ?? 10)) : 1;

  const emptyState = (colSpan: number) => (
    <tr>
      <td colSpan={colSpan} className="text-center py-12 text-muted-foreground text-sm">
        {emptyIcon}
        {emptyText}
      </td>
    </tr>
  );

  const pagination = totalPages > 1 && (
    <div className="flex items-center justify-between px-4 py-3 border-t border-border">
      <p className="text-xs text-muted-foreground">
        Hal. {page}/{totalPages} &bull; {data?.total} data
      </p>
      <div className="flex gap-2">
        <Button size="sm" variant="outline" onClick={() => setPage(Math.max(1, page - 1))} disabled={page === 1}>
          <ChevronLeft className="h-3.5 w-3.5" />
        </Button>
        <Button size="sm" variant="outline" onClick={() => setPage(Math.min(totalPages, page + 1))} disabled={page === totalPages}>
          <ChevronRight className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );

  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden shadow-card">
      {/* Mobile: card list */}
      {renderCard && (
        <div className="md:hidden divide-y divide-border">
          {isLoading
            ? <div className="p-4 space-y-3">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-20 bg-muted rounded-xl animate-pulse" />)}</div>
            : data?.data?.length === 0
            ? <div className="py-12 text-center text-muted-foreground text-sm">{emptyIcon}{emptyText}</div>
            : data?.data?.map(renderCard)
          }
        </div>
      )}

      {/* Desktop table (always) / Mobile table (when no renderCard) */}
      <div className={cn("overflow-x-auto", renderCard && "hidden md:block")}>
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-muted/50 border-b border-border">
              {cols.map((h) => (
                <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide whitespace-nowrap">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading
              ? Array.from({ length: 4 }).map((_, i) => <TableRowSkeleton key={i} cols={cols.length} />)
              : data?.data?.length === 0
              ? emptyState(cols.length)
              : data?.data?.map(renderRow)
            }
          </tbody>
        </table>
      </div>

      {pagination}
    </div>
  );
}
