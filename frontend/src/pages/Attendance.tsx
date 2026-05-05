import { Fragment, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Clock, ChevronLeft, ChevronRight, Pencil, X } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Badge, TableRowSkeleton } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/components/ui/toast";
import { attendanceApi, correctionsApi } from "@/lib/api";
import { fmtDate, fmtTime, getErrMsg } from "@/lib/utils";

function toDatetimeLocal(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(new Date(iso).toLocaleString("en-US", { timeZone: "Asia/Jakarta" }));
  return d.getFullYear() + "-"
    + String(d.getMonth() + 1).padStart(2, "0") + "-"
    + String(d.getDate()).padStart(2, "0") + "T"
    + String(d.getHours()).padStart(2, "0") + ":"
    + String(d.getMinutes()).padStart(2, "0");
}

export default function AttendancePage() {
  const [page, setPage] = useState(1);
  const PER_PAGE = 20;
  const toast = useToast();
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["attendance-history", page],
    queryFn: () => attendanceApi.history(page, PER_PAGE).then((r) => r.data),
    placeholderData: (prev) => prev,
  });

  const totalPages = data ? Math.ceil(data.total / PER_PAGE) : 1;

  // ── Correction request modal ───────────────────────────────
  const [corrModal, setCorrModal] = useState<{
    attendance_id: string;
    date: string;
    clock_in: string;
    clock_out: string;
    reason: string;
  } | null>(null);

  const submitCorr = useMutation({
    mutationFn: () => correctionsApi.create({
      attendance_id:       corrModal!.attendance_id,
      requested_clock_in:  corrModal!.clock_in  || undefined,
      requested_clock_out: corrModal!.clock_out || undefined,
      reason:              corrModal!.reason,
    }),
    onSuccess: () => {
      toast.success("Pengajuan koreksi terkirim!", "Menunggu persetujuan admin");
      qc.invalidateQueries({ queryKey: ["attendance-history"] });
      setCorrModal(null);
    },
    onError: (err) => toast.error("Gagal mengajukan", getErrMsg(err)),
  });

  return (
    <div>
      <PageHeader
        title="Riwayat Absensi"
        subtitle={data ? `${data.total} total data` : undefined}
      />

      {/* ── Correction modal ── */}
      {corrModal && (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/40 backdrop-blur-sm">
          <Card className="w-full md:max-w-sm rounded-t-2xl md:rounded-2xl border-0 shadow-xl animate-slide-up">
            <div className="flex items-center justify-between p-5 border-b border-border">
              <div>
                <h3 className="font-bold text-base">Ajukan Koreksi Absensi</h3>
                <p className="text-xs text-muted-foreground mt-0.5">{fmtDate(corrModal.date)}</p>
              </div>
              <button onClick={() => setCorrModal(null)} className="text-muted-foreground hover:text-foreground">
                <X className="h-5 w-5" />
              </button>
            </div>
            <CardContent className="p-5 space-y-4">
              <p className="text-xs text-muted-foreground bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                Isi jam yang <strong>seharusnya</strong> tercatat. Kosongkan jika tidak perlu dikoreksi.
              </p>
              <Input
                label="Jam Masuk yang Benar (WIB)"
                type="datetime-local"
                value={corrModal.clock_in}
                onChange={(e) => setCorrModal({ ...corrModal, clock_in: e.target.value })}
              />
              <Input
                label="Jam Keluar yang Benar (WIB)"
                type="datetime-local"
                value={corrModal.clock_out}
                onChange={(e) => setCorrModal({ ...corrModal, clock_out: e.target.value })}
              />
              <Input
                label="Alasan Koreksi"
                placeholder="Contoh: lupa clock-out karena sinyal lemah"
                value={corrModal.reason}
                onChange={(e) => setCorrModal({ ...corrModal, reason: e.target.value })}
                required
              />
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => setCorrModal(null)}>
                  Batal
                </Button>
                <Button
                  className="flex-1"
                  loading={submitCorr.isPending}
                  disabled={!corrModal.reason.trim() || (!corrModal.clock_in && !corrModal.clock_out)}
                  onClick={() => submitCorr.mutate()}
                >
                  Kirim Pengajuan
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <div className="px-4 md:px-6 py-4">
        <div className="rounded-2xl border border-border bg-card overflow-hidden shadow-card">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/50 border-b border-border">
                  {["Tanggal", "Masuk", "Keluar", "Durasi", "Status", ""].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {isLoading
                  ? Array.from({ length: 8 }).map((_, i) => <TableRowSkeleton key={i} cols={6} />)
                  : data?.data.length === 0
                  ? (
                    <tr>
                      <td colSpan={6} className="text-center py-12 text-muted-foreground text-sm">
                        <Clock className="h-8 w-8 mx-auto mb-2 opacity-30" />
                        Belum ada data absensi
                      </td>
                    </tr>
                  )
                  : data?.data.map((row: any) => {
                    const duration = row.clock_in && row.clock_out
                      ? Math.round((new Date(row.clock_out).getTime() - new Date(row.clock_in).getTime()) / 60000)
                      : null;
                    const h = duration ? Math.floor(duration / 60) : null;
                    const m = duration ? duration % 60 : null;
                    return (
                      <Fragment key={row.id}>
                        <tr className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                          <td className="px-4 py-3 font-medium">{fmtDate(row.date)}</td>
                          <td className="px-4 py-3 font-mono text-xs">
                            {row.clock_in ? fmtTime(row.clock_in) : <span className="text-muted-foreground">—</span>}
                          </td>
                          <td className="px-4 py-3 font-mono text-xs">
                            {row.clock_out ? fmtTime(row.clock_out) : <span className="text-muted-foreground">—</span>}
                          </td>
                          <td className="px-4 py-3 text-xs text-muted-foreground">
                            {duration ? `${h}j ${m}m` : "—"}
                          </td>
                          <td className="px-4 py-3">
                            <Badge status={row.status} />
                          </td>
                          <td className="px-4 py-3">
                            <button
                              onClick={() => setCorrModal({
                                attendance_id: row.id,
                                date: row.date,
                                clock_in:  toDatetimeLocal(row.clock_in),
                                clock_out: toDatetimeLocal(row.clock_out),
                                reason: "",
                              })}
                              className="p-1.5 rounded-lg bg-indigo-50 text-indigo-600 hover:bg-indigo-100 transition-colors"
                              title="Ajukan koreksi"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                          </td>
                        </tr>
                        {row.notes && (
                          <tr key={`${row.id}-notes`} className="border-b border-border/50 bg-muted/20">
                            <td colSpan={6} className="px-4 py-2">
                              <p className="text-xs text-muted-foreground">
                                <span className="font-semibold">Catatan:</span> {row.notes}
                              </p>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })
                }
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-border">
              <p className="text-xs text-muted-foreground">
                Halaman {page} dari {totalPages}
              </p>
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
