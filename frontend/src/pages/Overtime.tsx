import { Fragment, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, X, Timer, ChevronLeft, ChevronRight } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge, TableRowSkeleton } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/components/ui/toast";
import { overtimeApi } from "@/lib/api";
import { fmtDate, fmtDuration, getErrMsg } from "@/lib/utils";

export default function OvertimePage() {
  const [showForm, setShowForm] = useState(false);
  const [page, setPage] = useState(1);
  const [form, setForm] = useState({
    date: "", start_time: "", end_time: "", reason: "",
  });

  const toast = useToast();
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["overtime", page],
    queryFn: () => overtimeApi.list(page).then((r) => r.data),
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

  // Auto-calculate duration
  const durationMins = form.start_time && form.end_time
    ? (() => {
        const [sh, sm] = form.start_time.split(":").map(Number);
        const [eh, em] = form.end_time.split(":").map(Number);
        const diff = (eh * 60 + em) - (sh * 60 + sm);
        return diff > 0 ? diff : 0;
      })()
    : 0;

  const totalPages = data ? Math.ceil(data.total / (data.per_page ?? 20)) : 1;

  return (
    <div>
      <PageHeader
        title="Pengajuan Lembur"
        subtitle={data ? `${data.total} total pengajuan` : undefined}
        action={
          <Button size="sm" onClick={() => setShowForm(true)}>
            <Plus className="h-4 w-4" /> Ajukan
          </Button>
        }
      />

      <div className="px-4 md:px-6 py-4 space-y-4">
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

        {/* Table */}
        <div className="rounded-2xl border border-border bg-card overflow-hidden shadow-card">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/50 border-b border-border">
                  {["Tanggal", "Waktu", "Durasi", "Alasan", "Status"].map((h) => (
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
