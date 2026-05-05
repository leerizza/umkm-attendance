import { Fragment, useEffect, useState } from "react";
import { LocationPicker } from "@/components/LocationPicker";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Users, Clock, CalendarOff, Timer,
  CheckCircle2, XCircle, ChevronLeft, ChevronRight,
  TrendingUp, Settings, Download, Pencil, BarChart2, Search, X,
} from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge, CardSkeleton, TableRowSkeleton } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/components/ui/toast";
import { adminApi, leaveApi, overtimeApi, correctionsApi } from "@/lib/api";
import { fmtDate, fmtTime, fmtDuration, getErrMsg, cn } from "@/lib/utils";

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
  const [tab, setTab] = useState<AdminTab>("overview");
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
    queryFn: () => adminApi.attendance(page, attDateFrom || undefined).then((r) => r.data),
    enabled: tab === "attendance",
    placeholderData: (p) => p,
  });

  // Total durasi semua baris yang ada clock_in & clock_out
  const totalWorkMinutes = (attData?.data ?? []).reduce((sum: number, row: any) => {
    if (!row.clock_in || !row.clock_out) return sum;
    return sum + Math.floor(
      (new Date(row.clock_out).getTime() - new Date(row.clock_in).getTime()) / 60_000
    );
  }, 0);
  const rowsWithDuration = (attData?.data ?? []).filter((r: any) => r.clock_in && r.clock_out).length;

  // ── Leave ──────────────────────────────────────────────────
  const [leaveFilter, setLeaveFilter] = useState("pending");
  const { data: leaveData, isLoading: leaveLoading } = useQuery({
    queryKey: ["admin-leave", page, leaveFilter],
    queryFn: () => adminApi.leave(page, leaveFilter || undefined).then((r) => r.data),
    enabled: tab === "leave",
    placeholderData: (p) => p,
  });

  // ── Overtime ───────────────────────────────────────────────
  const [otFilter, setOtFilter] = useState("pending");
  const { data: otData, isLoading: otLoading } = useQuery({
    queryKey: ["admin-overtime", page, otFilter],
    queryFn: () => adminApi.overtime(page, otFilter || undefined).then((r) => r.data),
    enabled: tab === "overtime",
    placeholderData: (p) => p,
  });

  // ── Corrections ───────────────────────────────────────────
  const [corrFilter, setCorrFilter] = useState("pending");
  const { data: corrData, isLoading: corrLoading } = useQuery({
    queryKey: ["admin-corrections", page, corrFilter],
    queryFn: () => correctionsApi.adminList(page, corrFilter || undefined).then((r) => r.data),
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
  const [empActiveFilter, setEmpActiveFilter] = useState<"all" | "active" | "inactive">("all");
  const [empHistModal, setEmpHistModal] = useState<{ id: string; name: string } | null>(null);
  const [empHistPage, setEmpHistPage] = useState(1);

  const { data: empData, isLoading: empLoading } = useQuery({
    queryKey: ["admin-employees", page, empSearch, empActiveFilter],
    queryFn: () => adminApi.employees(
      page,
      empSearch || undefined,
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
    });
  }, [companyData]);

  const saveCompany = useMutation({
    mutationFn: () => adminApi.updateCompany({
      name:          companyForm.name || undefined,
      address:       companyForm.address || undefined,
      lat:           companyForm.lat ? parseFloat(companyForm.lat) : undefined,
      lng:           companyForm.lng ? parseFloat(companyForm.lng) : undefined,
      radius_meters: companyForm.radius_meters ? parseInt(companyForm.radius_meters) : undefined,
      work_start:    companyForm.work_start || undefined,
      work_end:      companyForm.work_end || undefined,
    }),
    onSuccess: () => {
      toast.success("Pengaturan disimpan!");
      qc.invalidateQueries({ queryKey: ["admin-company"] });
    },
    onError: (err) => toast.error("Gagal menyimpan", getErrMsg(err)),
  });

  // ── Export ─────────────────────────────────────────────────
  const [exportFrom, setExportFrom] = useState("");
  const [exportTo, setExportTo]     = useState("");
  const [exporting, setExporting]   = useState(false);

  async function handleExport() {
    setExporting(true);
    try {
      const res = await adminApi.exportAttendance(exportFrom || undefined, exportTo || undefined);
      const url = URL.createObjectURL(new Blob([res.data], { type: "text/csv" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = `absensi_${exportFrom || "bulan-ini"}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Export berhasil!");
    } catch (err) {
      toast.error("Export gagal", getErrMsg(err));
    } finally {
      setExporting(false);
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
          {TABS.map(({ id, label, Icon }) => {
            const badge =
              id === "leave"       ? (stats?.pending_leaves      ?? 0)
            : id === "overtime"    ? (stats?.pending_overtime    ?? 0)
            : id === "corrections" ? (stats?.pending_corrections ?? 0)
            : 0;
            return (
              <button
                key={id}
                onClick={() => { setTab(id); resetPage(); }}
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
                  { label: "Total Karyawan",   value: stats?.total_employees,    Icon: Users,       color: "bg-blue-50 text-blue-600" },
                  { label: "Hadir Hari Ini",  value: stats?.present_today,      Icon: Clock,       color: "bg-emerald-50 text-emerald-600" },
                  { label: "Cuti Pending",    value: stats?.pending_leaves,     Icon: CalendarOff, color: "bg-amber-50 text-amber-600" },
                  { label: "Lembur Pending",  value: stats?.pending_overtime,   Icon: Timer,       color: "bg-indigo-50 text-indigo-600" },
                  { label: "Koreksi Pending", value: stats?.pending_corrections,Icon: Pencil,      color: "bg-rose-50 text-rose-600" },
                ].map(({ label, value, Icon, color }) => (
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
            {/* Filter + Export bar */}
            <div className="flex flex-wrap items-end gap-2">
              <div className="flex flex-col gap-1">
                <label className="text-xs text-muted-foreground font-medium">Dari</label>
                <input
                  type="date"
                  value={attDateFrom}
                  onChange={(e) => { setAttDateFrom(e.target.value); setExportFrom(e.target.value); resetPage(); }}
                  className="h-8 rounded-lg border border-border bg-background px-2 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-muted-foreground font-medium">Sampai</label>
                <input
                  type="date"
                  value={attDateTo}
                  min={attDateFrom}
                  onChange={(e) => { setAttDateTo(e.target.value); setExportTo(e.target.value); resetPage(); }}
                  className="h-8 rounded-lg border border-border bg-background px-2 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
              <Button size="sm" variant="outline" onClick={handleExport} loading={exporting}>
                <Download className="h-3.5 w-3.5" />
                Export CSV
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
              cols={["Karyawan", "Tanggal", "Masuk", "Keluar", "Durasi", "Status"]}
              emptyIcon={<Clock className="h-8 w-8 mx-auto mb-2 opacity-30" />}
              emptyText="Belum ada data absensi"
              renderRow={(row: any) => {
                const workMinutes =
                  row.clock_in && row.clock_out
                    ? Math.floor(
                        (new Date(row.clock_out).getTime() - new Date(row.clock_in).getTime()) / 60_000
                      )
                    : null;
                return (
                <Fragment key={row.id}>
                  <tr className="border-b border-border/50 hover:bg-muted/30">
                    <td className="px-4 py-3 font-medium text-sm">{row.profiles?.full_name ?? "—"}</td>
                    <td className="px-4 py-3 text-xs">{fmtDate(row.date)}</td>
                    <td className="px-4 py-3 font-mono text-xs">{row.clock_in ? fmtTime(row.clock_in) : "—"}</td>
                    <td className="px-4 py-3 font-mono text-xs">{row.clock_out ? fmtTime(row.clock_out) : "—"}</td>
                    <td className="px-4 py-3 font-mono text-xs font-semibold text-purple-600">
                      {workMinutes != null ? fmtDuration(workMinutes) : "—"}
                    </td>
                    <td className="px-4 py-3"><Badge status={row.status} /></td>
                  </tr>
                  {row.notes && (
                    <tr className="border-b border-border/50 bg-muted/20">
                      <td colSpan={6} className="px-4 py-2">
                        <p className="text-xs text-muted-foreground">
                          <span className="font-semibold">Catatan:</span> {row.notes}
                        </p>
                      </td>
                    </tr>
                  )}
                </Fragment>
                );
              }}
            />
          </div>
        )}

        {/* ── Leave table ── */}
        {tab === "leave" && (
          <div className="space-y-3 animate-fade-in">
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
                  <td className="px-4 py-3 text-xs capitalize">{row.leave_type}</td>
                  <td className="px-4 py-3 text-xs">{fmtDate(row.start_date)}</td>
                  <td className="px-4 py-3 text-center font-semibold">{row.days_count}</td>
                  <td className="px-4 py-3"><Badge status={row.status} /></td>
                  <td className="px-4 py-3">
                    {row.status === "pending" && (
                      <div className="flex gap-1">
                        <button
                          onClick={() => openReview("leave", row.id, "approved", row.profiles?.full_name ?? "")}
                          className="p-1.5 rounded-lg bg-emerald-50 text-emerald-600 hover:bg-emerald-100 transition-colors"
                          title="Setujui"
                        >
                          <CheckCircle2 className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => openReview("leave", row.id, "rejected", row.profiles?.full_name ?? "")}
                          className="p-1.5 rounded-lg bg-red-50 text-red-600 hover:bg-red-100 transition-colors"
                          title="Tolak"
                        >
                          <XCircle className="h-4 w-4" />
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              )}
            />
          </div>
        )}

        {/* ── Overtime table ── */}
        {tab === "overtime" && (
          <div className="space-y-3 animate-fade-in">
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
                  <td className="px-4 py-3 font-mono text-xs">
                    {row.start_time.slice(0,5)} – {row.end_time.slice(0,5)}
                  </td>
                  <td className="px-4 py-3 font-semibold text-amber-600 text-xs">
                    {fmtDuration(row.duration_minutes)}
                  </td>
                  <td className="px-4 py-3"><Badge status={row.status} /></td>
                  <td className="px-4 py-3">
                    {row.status === "pending" && (
                      <div className="flex gap-1">
                        <button
                          onClick={() => openReview("overtime", row.id, "approved", row.profiles?.full_name ?? "")}
                          className="p-1.5 rounded-lg bg-emerald-50 text-emerald-600 hover:bg-emerald-100 transition-colors"
                        >
                          <CheckCircle2 className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => openReview("overtime", row.id, "rejected", row.profiles?.full_name ?? "")}
                          className="p-1.5 rounded-lg bg-red-50 text-red-600 hover:bg-red-100 transition-colors"
                        >
                          <XCircle className="h-4 w-4" />
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              )}
            />
          </div>
        )}

        {/* ── Corrections ── */}
        {tab === "corrections" && (
          <div className="space-y-3 animate-fade-in">
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
            <TableWrapper
              isLoading={corrLoading}
              data={corrData}
              page={page}
              setPage={setPage}
              cols={["Karyawan", "Tanggal", "Jam Masuk Baru", "Jam Keluar Baru", "Alasan", "Status", "Aksi"]}
              emptyIcon={<Pencil className="h-8 w-8 mx-auto mb-2 opacity-30" />}
              emptyText="Tidak ada pengajuan koreksi"
              renderRow={(row: any) => (
                <tr key={row.id} className="border-b border-border/50 hover:bg-muted/30">
                  <td className="px-4 py-3 font-medium text-sm">{row.profiles?.full_name ?? "—"}</td>
                  <td className="px-4 py-3 text-xs">{fmtDate(row.attendance?.date)}</td>
                  <td className="px-4 py-3 font-mono text-xs text-indigo-600">
                    {row.requested_clock_in ? fmtTime(row.requested_clock_in) : "—"}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-indigo-600">
                    {row.requested_clock_out ? fmtTime(row.requested_clock_out) : "—"}
                  </td>
                  <td className="px-4 py-3 text-xs max-w-[140px] truncate" title={row.reason}>{row.reason}</td>
                  <td className="px-4 py-3"><Badge status={row.status} /></td>
                  <td className="px-4 py-3">
                    {row.status === "pending" && (
                      <div className="flex gap-1">
                        <button
                          onClick={() => approveCorr.mutate({ id: row.id, status: "approved" })}
                          disabled={approveCorr.isPending}
                          className="p-1.5 rounded-lg bg-emerald-50 text-emerald-600 hover:bg-emerald-100 transition-colors"
                          title="Setujui"
                        >
                          <CheckCircle2 className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => approveCorr.mutate({ id: row.id, status: "rejected" })}
                          disabled={approveCorr.isPending}
                          className="p-1.5 rounded-lg bg-red-50 text-red-600 hover:bg-red-100 transition-colors"
                          title="Tolak"
                        >
                          <XCircle className="h-4 w-4" />
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
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
              cols={["Nama", "Jabatan", "Role", "HP", "Aksi"]}
              emptyIcon={<Users className="h-8 w-8 mx-auto mb-2 opacity-30" />}
              emptyText="Belum ada karyawan"
              renderRow={(row: any) => (
                <tr key={row.id} className={cn("border-b border-border/50 hover:bg-muted/30", !row.is_active && "opacity-50")}>
                  <td className="px-4 py-3 font-medium text-sm">
                    <button
                      onClick={() => { setEmpHistModal({ id: row.id, name: row.full_name }); setEmpHistPage(1); }}
                      className="text-left hover:text-primary hover:underline transition-colors"
                    >
                      {row.full_name}
                    </button>
                    {!row.is_active && <span className="ml-1.5 text-[10px] text-red-500 font-normal">(nonaktif)</span>}
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{row.position ?? "—"}</td>
                  <td className="px-4 py-3">
                    <select
                      value={row.role}
                      onChange={(e) => changeRole.mutate({ id: row.id, role: e.target.value })}
                      className="text-xs border border-border rounded-lg px-2 py-0.5 bg-background focus:outline-none focus:ring-1 focus:ring-primary"
                    >
                      <option value="employee">employee</option>
                      <option value="admin">admin</option>
                    </select>
                  </td>
                  <td className="px-4 py-3 text-xs font-mono">{row.phone ?? "—"}</td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => toggleActive.mutate({ id: row.id, is_active: !row.is_active })}
                      className={cn(
                        "text-xs px-2 py-1 rounded-lg font-medium transition-colors",
                        row.is_active
                          ? "bg-red-50 text-red-600 hover:bg-red-100"
                          : "bg-emerald-50 text-emerald-600 hover:bg-emerald-100"
                      )}
                    >
                      {row.is_active ? "Nonaktifkan" : "Aktifkan"}
                    </button>
                  </td>
                </tr>
              )}
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
                <button onClick={() => setEmpHistModal(null)} className="text-muted-foreground hover:text-foreground">
                  <X className="h-5 w-5" />
                </button>
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
                        const mins = row.clock_in && row.clock_out
                          ? Math.floor((new Date(row.clock_out).getTime() - new Date(row.clock_in).getTime()) / 60_000)
                          : null;
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
                    const url = URL.createObjectURL(new Blob([res.data], { type: "text/csv" }));
                    const a = document.createElement("a");
                    a.href = url;
                    a.download = `rekap_${reportYear}_${String(reportMonth).padStart(2, "0")}.csv`;
                    a.click();
                    URL.revokeObjectURL(url);
                    toast.success("Export rekap berhasil!");
                  } catch (err) {
                    toast.error("Export gagal", getErrMsg(err));
                  } finally {
                    setExporting(false);
                  }
                }}
              >
                <Download className="h-3.5 w-3.5" />
                Export CSV
              </Button>
            </div>

            <div className="rounded-2xl border border-border bg-card overflow-hidden shadow-card">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-muted/50 border-b border-border">
                      {["Karyawan", "Jabatan", "Hadir", "Terlambat", "Cuti", "Lembur", "Total Jam"].map((h) => (
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
                            {Array.from({ length: 7 }).map((_, j) => (
                              <td key={j} className="px-4 py-3">
                                <div className="h-3 bg-muted rounded animate-pulse w-16" />
                              </td>
                            ))}
                          </tr>
                        ))
                      : !reportData?.data?.length
                      ? (
                        <tr>
                          <td colSpan={7} className="text-center py-12 text-muted-foreground text-sm">
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
                            <span className={cn("font-semibold text-sm", row.terlambat > 0 ? "text-amber-600" : "text-muted-foreground")}>
                              {row.terlambat}
                            </span>
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
          <div className="space-y-4 animate-fade-in max-w-lg">
            <Card>
              <CardContent className="p-5 space-y-4">
                <p className="text-sm font-semibold text-foreground">Informasi Perusahaan</p>
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
                  placeholder="100"
                  value={companyForm.radius_meters}
                  onChange={(e) => setCompanyForm({ ...companyForm, radius_meters: e.target.value })}
                />
              </CardContent>
            </Card>

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
              </CardContent>
            </Card>

            <Button
              className="w-full"
              size="lg"
              loading={saveCompany.isPending}
              disabled={companyLoading}
              onClick={() => saveCompany.mutate()}
            >
              Simpan Pengaturan
            </Button>
          </div>
        )}
      </div>
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

function TableWrapper({
  isLoading, data, page, setPage, cols, emptyIcon, emptyText, renderRow,
}: {
  isLoading: boolean;
  data: any;
  page: number;
  setPage: (p: number) => void;
  cols: string[];
  emptyIcon: React.ReactNode;
  emptyText: string;
  renderRow: (row: any) => React.ReactNode;
}) {
  const totalPages = data ? Math.ceil(data.total / (data.per_page ?? 20)) : 1;

  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden shadow-card">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-muted/50 border-b border-border">
              {cols.map((h) => (
                <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading
              ? Array.from({ length: 6 }).map((_, i) => (
                  <TableRowSkeleton key={i} cols={cols.length} />
                ))
              : data?.data?.length === 0
              ? (
                <tr>
                  <td colSpan={cols.length} className="text-center py-12 text-muted-foreground text-sm">
                    {emptyIcon}
                    {emptyText}
                  </td>
                </tr>
              )
              : data?.data?.map(renderRow)
            }
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between px-4 py-3 border-t border-border">
          <p className="text-xs text-muted-foreground">
            Halaman {page} dari {totalPages} &bull; {data?.total} data
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
      )}
    </div>
  );
}
