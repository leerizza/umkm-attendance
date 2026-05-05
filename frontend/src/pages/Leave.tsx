import { Fragment, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, X, CalendarOff, ChevronLeft, ChevronRight, Palmtree } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge, TableRowSkeleton } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/components/ui/toast";
import { leaveApi } from "@/lib/api";
import { fmtDate, getErrMsg, cn } from "@/lib/utils";

const LEAVE_TYPES = [
  { value: "annual",   label: "Cuti Tahunan" },
  { value: "sick",     label: "Sakit" },
  { value: "personal", label: "Keperluan Pribadi" },
  { value: "other",    label: "Lainnya" },
];

export default function LeavePage() {
  const [showForm, setShowForm] = useState(false);
  const [page, setPage] = useState(1);
  const [form, setForm] = useState({
    leave_type: "annual",
    start_date: "",
    end_date: "",
    reason: "",
  });

  const toast = useToast();
  const qc = useQueryClient();

  const { data: balance } = useQuery({
    queryKey: ["leave-balance"],
    queryFn: () => leaveApi.balance().then((r) => r.data),
  });

  const { data, isLoading } = useQuery({
    queryKey: ["leave", page],
    queryFn: () => leaveApi.list(page).then((r) => r.data),
    placeholderData: (prev) => prev,
  });

  const mutation = useMutation({
    mutationFn: () => leaveApi.create(form),
    onSuccess: () => {
      toast.success("Pengajuan terkirim!", "Menunggu persetujuan admin");
      qc.invalidateQueries({ queryKey: ["leave"] });
      qc.invalidateQueries({ queryKey: ["leave-balance"] });
      setShowForm(false);
      setForm({ leave_type: "annual", start_date: "", end_date: "", reason: "" });
    },
    onError: (err) => toast.error("Gagal mengajukan", getErrMsg(err)),
  });

  const totalPages = data ? Math.ceil(data.total / (data.per_page ?? 20)) : 1;
  const days = form.start_date && form.end_date
    ? Math.max(0, Math.ceil((new Date(form.end_date).getTime() - new Date(form.start_date).getTime()) / 86400000) + 1)
    : 0;

  return (
    <div>
      <PageHeader
        title="Pengajuan Cuti"
        subtitle={data ? `${data.total} total pengajuan` : undefined}
        action={
          <Button size="sm" onClick={() => setShowForm(true)}>
            <Plus className="h-4 w-4" /> Ajukan
          </Button>
        }
      />

      <div className="px-4 md:px-6 py-4 space-y-4">
        {/* Leave balance card */}
        {balance && (
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: "Jatah Cuti", value: balance.allowance, color: "text-blue-600 bg-blue-50" },
              { label: "Sudah Dipakai", value: balance.used,      color: "text-amber-600 bg-amber-50" },
              { label: "Sisa Cuti",    value: balance.remaining,  color: balance.remaining <= 3 ? "text-red-600 bg-red-50" : "text-emerald-600 bg-emerald-50" },
            ].map(({ label, value, color }) => (
              <Card key={label}>
                <CardContent className="p-3 text-center space-y-1">
                  <div className={cn("w-8 h-8 rounded-lg mx-auto flex items-center justify-center", color)}>
                    <Palmtree className="h-4 w-4" />
                  </div>
                  <p className="text-xl font-bold text-foreground">{value}</p>
                  <p className="text-[10px] text-muted-foreground">{label}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
        {/* Form modal */}
        {showForm && (
          <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center p-0 md:p-4 bg-black/40 backdrop-blur-sm">
            <Card className="w-full md:max-w-md rounded-t-2xl md:rounded-2xl animate-slide-up border-0 shadow-xl">
              <div className="flex items-center justify-between p-5 border-b border-border">
                <h3 className="font-bold text-base">Ajukan Cuti</h3>
                <button onClick={() => setShowForm(false)} className="text-muted-foreground hover:text-foreground">
                  <X className="h-5 w-5" />
                </button>
              </div>
              <CardContent className="p-5 space-y-4">
                {/* Leave type */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium text-foreground/80">Jenis Cuti</label>
                  <div className="grid grid-cols-2 gap-2">
                    {LEAVE_TYPES.map((t) => (
                      <button
                        key={t.value}
                        type="button"
                        onClick={() => setForm({ ...form, leave_type: t.value })}
                        className={cn(
                          "py-2.5 px-3 rounded-xl border text-sm font-medium transition-all",
                          form.leave_type === t.value
                            ? "bg-primary text-white border-primary"
                            : "border-border text-muted-foreground hover:border-primary/50"
                        )}
                      >
                        {t.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <Input
                    label="Tanggal Mulai"
                    type="date"
                    value={form.start_date}
                    onChange={(e) => setForm({ ...form, start_date: e.target.value })}
                    required
                  />
                  <Input
                    label="Tanggal Selesai"
                    type="date"
                    value={form.end_date}
                    min={form.start_date}
                    onChange={(e) => setForm({ ...form, end_date: e.target.value })}
                    required
                  />
                </div>

                {days > 0 && (
                  <p className="text-xs text-indigo-600 font-medium bg-indigo-50 px-3 py-2 rounded-lg">
                    Total: {days} hari kerja
                  </p>
                )}

                <Input
                  label="Alasan"
                  placeholder="Tulis alasan cuti..."
                  value={form.reason}
                  onChange={(e) => setForm({ ...form, reason: e.target.value })}
                  required
                />

                <Button
                  className="w-full"
                  size="lg"
                  loading={mutation.isPending}
                  onClick={() => mutation.mutate()}
                  disabled={!form.start_date || !form.end_date || !form.reason || days < 1}
                >
                  Kirim Pengajuan
                </Button>
              </CardContent>
            </Card>
          </div>
        )}

        {/* List */}
        <div className="rounded-2xl border border-border bg-card overflow-hidden shadow-card">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/50 border-b border-border">
                  {["Jenis", "Tanggal", "Hari", "Alasan", "Status"].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {isLoading
                  ? Array.from({ length: 5 }).map((_, i) => <TableRowSkeleton key={i} cols={5} />)
                  : data?.data.length === 0
                  ? (
                    <tr>
                      <td colSpan={5} className="text-center py-12 text-muted-foreground text-sm">
                        <CalendarOff className="h-8 w-8 mx-auto mb-2 opacity-30" />
                        Belum ada pengajuan cuti
                      </td>
                    </tr>
                  )
                  : data?.data.map((row: any) => (
                    <Fragment key={row.id}>
                      <tr className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                        <td className="px-4 py-3 font-medium capitalize">
                          {row.leave_type === "annual" ? "Tahunan"
                            : row.leave_type === "sick" ? "Sakit"
                            : row.leave_type === "personal" ? "Pribadi"
                            : "Lainnya"}
                        </td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">
                          {fmtDate(row.start_date)} {row.start_date !== row.end_date && `– ${fmtDate(row.end_date)}`}
                        </td>
                        <td className="px-4 py-3 text-center font-semibold">{row.days_count}</td>
                        <td className="px-4 py-3 text-xs max-w-[120px] truncate">{row.reason}</td>
                        <td className="px-4 py-3">
                          <Badge status={row.status} />
                        </td>
                      </tr>
                      {row.reviewer_note && (
                        <tr key={`${row.id}-note`} className="border-b border-border/50 bg-muted/20">
                          <td colSpan={5} className="px-4 py-2">
                            <p className="text-xs text-muted-foreground">
                              <span className="font-semibold">Catatan admin:</span> {row.reviewer_note}
                            </p>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))
                }
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-border">
              <p className="text-xs text-muted-foreground">Halaman {page} dari {totalPages}</p>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}>
                  <ChevronLeft className="h-3.5 w-3.5" />
                </Button>
                <Button size="sm" variant="outline" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages}>
                  <ChevronRight className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
