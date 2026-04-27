import { Fragment, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Clock, ChevronLeft, ChevronRight } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Badge, TableRowSkeleton } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { attendanceApi } from "@/lib/api";
import { fmtDate, fmtTime } from "@/lib/utils";

export default function AttendancePage() {
  const [page, setPage] = useState(1);
  const PER_PAGE = 20;

  const { data, isLoading } = useQuery({
    queryKey: ["attendance-history", page],
    queryFn: () => attendanceApi.history(page, PER_PAGE).then((r) => r.data),
    placeholderData: (prev) => prev,
  });

  const totalPages = data ? Math.ceil(data.total / PER_PAGE) : 1;

  return (
    <div>
      <PageHeader
        title="Riwayat Absensi"
        subtitle={data ? `${data.total} total data` : undefined}
      />

      <div className="px-4 md:px-6 py-4">
        {/* Desktop table */}
        <div className="rounded-2xl border border-border bg-card overflow-hidden shadow-card">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/50 border-b border-border">
                  {["Tanggal", "Masuk", "Keluar", "Durasi", "Status"].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {isLoading
                  ? Array.from({ length: 8 }).map((_, i) => <TableRowSkeleton key={i} cols={5} />)
                  : data?.data.length === 0
                  ? (
                    <tr>
                      <td colSpan={5} className="text-center py-12 text-muted-foreground text-sm">
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
                        </tr>
                        {row.notes && (
                          <tr key={`${row.id}-notes`} className="border-b border-border/50 bg-muted/20">
                            <td colSpan={5} className="px-4 py-2">
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

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-border">
              <p className="text-xs text-muted-foreground">
                Halaman {page} dari {totalPages}
              </p>
              <div className="flex gap-2">
                <Button
                  size="sm" variant="outline"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                </Button>
                <Button
                  size="sm" variant="outline"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                >
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
