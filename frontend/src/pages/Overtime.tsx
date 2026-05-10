import { Fragment, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, X, Timer, ChevronLeft, ChevronRight, Filter, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge, TableRowSkeleton } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/components/ui/toast";
import { overtimeApi } from "@/lib/api";
import { fmtDate, fmtDuration, getErrMsg, cn } from "@/lib/utils";

const PER_PAGE = 10;

export default function OvertimePage() {
  const [showForm, setShowForm] = useState(false);
  const [page, setPage] = useState(1);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [showFilter, setShowFilter] = useState(false);
  const [form, setForm] = useState({
    date: "", start_time: "", end_time: "", reason: "",
  });

  const toast = useToast();
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["overtime", page, dateFrom, dateTo],
    queryFn: () => overtimeApi.list(page, PER_PAGE, dateFrom || undefined, dateTo || undefined).then((r) => r.data),
    placeholderData: (prev) => prev,
  });

  const mutation = useMutation({
    mutationFn: () => overtimeApi.create(form),
    onSuccess: () => {
      toast.success("Pengajuan lembur terkirim!", "Menunggu persetujuan admin");
      qc.invalidateQueries({ queryKey: ["overtime"] });
      setShowForm(false);
      setForm({ date: "", start_time: "", end_time: "", reason: "" });
    },
    onError: (err) => toast.error("Gagal mengajukan", getErrMsg(err)),
  });

  const cancelMutation = useMutation({
    mutationFn: (id: string) => overtimeApi.cancel(id),
    onSuccess: () => {
      toast.success("Pengajuan dibatalkan");
      qc.invalidateQueries({ queryKey: ["overtime"] });
    },
    onError: (err) => toast.error("Gagal membatalkan", getErrMsg(err)),
  });

  const durationMins = form.start_time && form.end_time
    ? (() => {
        const [sh, sm] = form.start_time.split(":").map(Number);
        const [eh, em] = form.end_time.split(":").map(Number);
        const diff = (eh * 60 + em) - (sh * 60 + sm);
        return diff > 0 ? diff : 0;
      })()
    : 0;

  const totalPages = data ? Math.ceil(data.total / PER_PAGE) : 1;
  const hasFilter = dateFrom || dateTo;

  return (
    <div>
      <PageHeader
        title="Pengajuan Lembur"
        subtitle={data ? `${data.total} total pengajuan` : undefined}
        action={
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowFilter(!showFilter)}
              className={cn("flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border font-medium transition-colors",
                hasFilter ? "bg-primary text-white border-primary" : "border-border text-muted-foreground hover:border-primary/50"
              )}
            >
              <Filter className="h-3.5 w-3.5" />
              Filter{hasFilter ? " ✓" : ""}
            </button>
            <Button size="sm" onClick={() => setShowForm(true)}>
              <Plus className="h-4 w-4" /> Ajukan
            </Button>
          </div>
        }
      />

      {/* Form modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/40 backdrop-blur-sm">
          <Card className="w-full md:max-w-md rounded-t-2xl md:rounded-2xl animate-slide-up border-0 shadow-xl">
            <div className="flex items-center justify-between p-5 border-b border-border">
              <h3 className="font-bold text-base">Ajukan Lembur</h3>
              <button onClick={() => setShowForm(false)} className="text-muted-foreground hover:text-foreground">
                <X className="h-5 w-5" />
              </button>
            </div>
            <CardContent className="p-5 space-y-4">
              <Input
                label="Tanggal Lembur"
                type="date"
                value={form.date}
                onChange={(e) => setForm({ ...form, date: e.target.value })}
                required
              />
              <div className="grid grid-cols-2 gap-3">
                <Input
                  label="Jam Mulai"
                  type="time"
                  value={form.start_time}
                  onChange={(e) => setForm({ ...form, start_time: e.target.value })}
                  required
                />
                <Input
                  label="Jam Selesai"
                  type="time"
                  value={form.end_time}
                  onChange={(e) => setForm({ ...form, end_time: e.target.value })}
                  required
                />
              </div>

              {durationMins > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex items-center justify-between">
                  <span className="text-sm text-amber-800 font-medium">Durasi lembur</span>
                  <span className="text-amber-700 font-bold font-mono">{fmtDuration(durationMins)}</span>
                </div>
              )}

              <Input
                label="Alasan Lembur"
                placeholder="Jelaskan keperluan lembur..."
                value={form.reason}
                onChange={(e) => setForm({ ...form, reason: e.target.value })}
                required
              />

              <Button
                className="w-full"
                size="lg"
                loading={mutation.isPending}
                onClick={() => mutation.mutate()}
                disabled={!form.date || !form.start_time || !form.end_time || !form.reason || durationMins === 0}
              >
                Kirim Pengajuan
              </Button>
            </CardContent>
          </Card>
        </div>
      )}

      <div className="px-4 md:px-6 py-4 space-y-3">
        {/* Filter panel */}
        {showFilter && (
          <div className="flex flex-wrap items-center gap-2 p-3 rounded-xl bg-muted/40 border border-border">
            <div className="flex items-center gap-1.5 flex-1 flex-wrap">
              <input type="date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setPage(1); }}
                className="h-8 flex-1 min-w-[130px] rounded-lg border border-border bg-background px-2 text-xs focus:outline-none focus:ring-1 focus:ring-primary" />
              <span className="text-xs text-muted-foreground">–</span>
              <input type="date" value={dateTo} min={dateFrom} onChange={(e) => { setDateTo(e.target.value); setPage(1); }}
                className="h-8 flex-1 min-w-[130px] rounded-lg border border-border bg-background px-2 text-xs focus:outline-none focus:ring-1 focus:ring-primary" />
            </div>
            {hasFilter && (
              <button onClick={() => { setDateFrom(""); setDateTo(""); setPage(1); }}
                className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 px-2 py-1 rounded-lg border border-border">
                <X className="h-3 w-3" /> Reset
              </button>
            )}
          </div>
        )}

        {/* Table */}
        <div className="rounded-2xl border border-border bg-card overflow-hidden shadow-card">
          {/* Mobile cards */}
          <div className="md:hidden divide-y divide-border">
            {isLoading
              ? <div className="p-4 space-y-3">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-20 bg-muted rounded-xl animate-pulse" />)}</div>
              : data?.data.length === 0
              ? <div className="py-12 text-center text-muted-foreground text-sm"><Timer className="h-8 w-8 mx-auto mb-2 opacity-30" />Belum ada pengajuan lembur</div>
              : data?.data.map((row: any) => (
                <div key={row.id} className="px-4 py-3 space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-sm">{fmtDate(row.date)}</span>
                    <div className="flex items-center gap-2">
                      <Badge status={row.status} />
                      {row.status === "pending" && (
                        <button
                          onClick={() => { if (window.confirm("Batalkan pengajuan lembur ini?")) cancelMutation.mutate(row.id); }}
                          disabled={cancelMutation.isPending}
                          className="p-1 rounded-lg bg-red-50 text-red-500 hover:bg-red-100 transition-colors"
                          title="Batalkan"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-3 text-xs font-mono text-muted-foreground">
                    <span>{row.start_time.slice(0, 5)} – {row.end_time.slice(0, 5)}</span>
                    <span className="text-amber-600 font-bold">{fmtDuration(row.duration_minutes)}</span>
                  </div>
                  <p className="text-xs text-muted-foreground truncate">{row.reason}</p>
                  {row.reviewer_note && (
                    <p className="text-xs text-muted-foreground bg-muted/50 rounded-lg px-2 py-1">
                      <span className="font-semibold">Catatan admin:</span> {row.reviewer_note}
                    </p>
                  )}
                </div>
              ))
            }
          </div>

          {/* Desktop table */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/50 border-b border-border">
                  {["Tanggal", "Waktu", "Durasi", "Alasan", "Status", ""].map((h) => (
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
                      <td colSpan={6} className="text-center py-12 text-muted-foreground text-sm">
                        <Timer className="h-8 w-8 mx-auto mb-2 opacity-30" />
                        Belum ada pengajuan lembur
                      </td>
                    </tr>
                  )
                  : data?.data.map((row: any) => (
                    <Fragment key={row.id}>
                      <tr className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                        <td className="px-4 py-3 font-medium">{fmtDate(row.date)}</td>
                        <td className="px-4 py-3 font-mono text-xs">
                          {row.start_time.slice(0, 5)} – {row.end_time.slice(0, 5)}
                        </td>
                        <td className="px-4 py-3 font-semibold text-amber-600">
                          {fmtDuration(row.duration_minutes)}
                        </td>
                        <td className="px-4 py-3 text-xs max-w-[120px] truncate">{row.reason}</td>
                        <td className="px-4 py-3"><Badge status={row.status} /></td>
                        <td className="px-4 py-3">
                          {row.status === "pending" && (
                            <button
                              onClick={() => { if (window.confirm("Batalkan pengajuan lembur ini?")) cancelMutation.mutate(row.id); }}
                              disabled={cancelMutation.isPending}
                              className="p-1.5 rounded-lg bg-red-50 text-red-500 hover:bg-red-100 transition-colors"
                              title="Batalkan"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </td>
                      </tr>
                      {row.reviewer_note && (
                        <tr key={`${row.id}-note`} className="border-b border-border/50 bg-muted/20">
                          <td colSpan={6} className="px-4 py-2">
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
              <p className="text-xs text-muted-foreground">Hal. {page}/{totalPages} · {data?.total} data</p>
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
