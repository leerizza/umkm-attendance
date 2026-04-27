import { useState, Fragment } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Building2, Users, Plus, ChevronLeft, MoreHorizontal,
  CheckCircle2, XCircle, Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LocationPicker } from "@/components/LocationPicker";
import { superadminApi, CompanyCreatePayload } from "@/lib/api";
import { useToast } from "@/components/ui/toast";
import { getErrMsg, cn } from "@/lib/utils";

// ─── PageHeader (reuse pattern from Admin page) ──────────────────────────────
function PageHeader({
  title, subtitle, action,
}: { title: string; subtitle?: string; action?: React.ReactNode }) {
  return (
    <div className="sticky top-0 z-30 bg-background/95 backdrop-blur border-b border-border px-4 py-3 flex items-center justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-base font-bold truncate">{title}</h1>
        {subtitle && <p className="text-xs text-muted-foreground truncate">{subtitle}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

// ─── TableWrapper ─────────────────────────────────────────────────────────────
function TableWrapper({
  children, page, total, perPage, onPage,
}: {
  children: React.ReactNode;
  page: number;
  total: number;
  perPage: number;
  onPage: (p: number) => void;
}) {
  const pages = Math.ceil(total / (perPage ?? 20));
  return (
    <div className="rounded-xl border border-border overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">{children}</table>
      </div>
      {pages > 1 && (
        <div className="flex items-center justify-between px-4 py-2.5 border-t border-border bg-muted/20 text-xs text-muted-foreground">
          <span>{total} data</span>
          <div className="flex gap-1">
            <button
              onClick={() => onPage(page - 1)}
              disabled={page === 1}
              className="px-2 py-1 rounded disabled:opacity-40 hover:bg-accent"
            >
              ‹
            </button>
            <span className="px-2 py-1">{page} / {pages}</span>
            <button
              onClick={() => onPage(page + 1)}
              disabled={page === pages}
              className="px-2 py-1 rounded disabled:opacity-40 hover:bg-accent"
            >
              ›
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Create Company Modal ─────────────────────────────────────────────────────
const EMPTY_FORM: CompanyCreatePayload = {
  name: "", code: "", address: "",
  lat: null as any, lng: null as any,
  radius_meters: 100, work_start: "08:00", work_end: "17:00",
};

function CreateCompanyModal({
  open, onClose, onCreated,
}: { open: boolean; onClose: () => void; onCreated: () => void }) {
  const toast = useToast();
  const [form, setForm] = useState<CompanyCreatePayload>(EMPTY_FORM);

  const mutation = useMutation({
    mutationFn: () => superadminApi.createCompany({
      ...form,
      code: form.code.toUpperCase(),
    }),
    onSuccess: () => {
      toast.success("Perusahaan dibuat!", `${form.name} (${form.code}) berhasil ditambahkan.`);
      setForm(EMPTY_FORM);
      onCreated();
      onClose();
    },
    onError: (err) => toast.error("Gagal membuat perusahaan", getErrMsg(err)),
  });

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 overflow-y-auto">
      <div className="w-full max-w-lg bg-white rounded-2xl shadow-xl my-8">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <p className="font-bold text-sm">Tambah Perusahaan Baru</p>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">✕</button>
        </div>
        <div className="p-5 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <Input
                label="Nama Perusahaan"
                placeholder="PT. Contoh Maju"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
              />
            </div>
            <Input
              label="Kode Unik"
              placeholder="DEMO2024"
              value={form.code}
              onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
              required
            />
            <Input
              label="Radius Absen (m)"
              type="number"
              min={10}
              value={form.radius_meters}
              onChange={(e) => setForm({ ...form, radius_meters: parseInt(e.target.value) || 100 })}
            />
            <Input
              label="Jam Masuk"
              type="time"
              value={form.work_start}
              onChange={(e) => setForm({ ...form, work_start: e.target.value })}
            />
            <Input
              label="Jam Pulang"
              type="time"
              value={form.work_end}
              onChange={(e) => setForm({ ...form, work_end: e.target.value })}
            />
          </div>

          <div>
            <p className="text-xs font-medium text-foreground mb-2">Lokasi Kantor</p>
            <LocationPicker
              lat={form.lat ?? null}
              lng={form.lng ?? null}
              onChange={(lat, lng) => setForm({ ...form, lat, lng })}
            />
          </div>
        </div>
        <div className="px-5 pb-5 flex justify-end gap-2">
          <Button variant="outline" onClick={onClose} disabled={mutation.isPending}>Batal</Button>
          <Button
            onClick={() => mutation.mutate()}
            loading={mutation.isPending}
            disabled={!form.name || !form.code}
          >
            Buat Perusahaan
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Employee List Panel ───────────────────────────────────────────────────────
function EmployeePanel({
  company, onBack,
}: { company: { id: string; name: string }; onBack: () => void }) {
  const toast = useToast();
  const qc = useQueryClient();
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ["superadmin-employees", company.id, page],
    queryFn: () => superadminApi.listEmployees(company.id, page).then((r) => r.data),
  });

  const roleMutation = useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: string }) =>
      superadminApi.updateRole(company.id, userId, role),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["superadmin-employees", company.id] });
      toast.success("Role diperbarui");
    },
    onError: (err) => toast.error("Gagal", getErrMsg(err)),
  });

  const ROLE_OPTIONS = ["employee", "admin", "superadmin"];

  return (
    <div>
      <PageHeader
        title={`Karyawan — ${company.name}`}
        subtitle={`${data?.total ?? "..."} karyawan terdaftar`}
        action={
          <Button variant="outline" size="sm" onClick={onBack}>
            <ChevronLeft className="h-4 w-4 mr-1" /> Kembali
          </Button>
        }
      />
      <div className="p-4">
        {isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <TableWrapper
            page={page}
            total={data?.total ?? 0}
            perPage={data?.per_page ?? 50}
            onPage={setPage}
          >
            <thead>
              <tr className="border-b border-border bg-muted/40">
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">Nama</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground hidden sm:table-cell">Jabatan</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">Role</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">Status</th>
              </tr>
            </thead>
            <tbody>
              {(data?.data ?? []).map((emp: any) => (
                <tr key={emp.id} className="border-b border-border last:border-0 hover:bg-muted/30">
                  <td className="px-4 py-3 font-medium text-sm">{emp.full_name}</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground hidden sm:table-cell">
                    {emp.position || "—"}
                  </td>
                  <td className="px-4 py-3">
                    <select
                      value={emp.role}
                      onChange={(e) => roleMutation.mutate({ userId: emp.id, role: e.target.value })}
                      className="text-xs border border-border rounded-lg px-2 py-1 bg-background focus:outline-none focus:ring-1 focus:ring-primary"
                    >
                      {ROLE_OPTIONS.map((r) => (
                        <option key={r} value={r}>{r}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-3">
                    <span className={cn(
                      "inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium",
                      emp.is_active
                        ? "bg-emerald-50 text-emerald-700"
                        : "bg-red-50 text-red-600"
                    )}>
                      {emp.is_active ? (
                        <><CheckCircle2 className="h-3 w-3" /> Aktif</>
                      ) : (
                        <><XCircle className="h-3 w-3" /> Nonaktif</>
                      )}
                    </span>
                  </td>
                </tr>
              ))}
              {(data?.data ?? []).length === 0 && (
                <tr>
                  <td colSpan={4} className="text-center py-10 text-sm text-muted-foreground">
                    Belum ada karyawan
                  </td>
                </tr>
              )}
            </tbody>
          </TableWrapper>
        )}
      </div>
    </div>
  );
}

// ─── Main Superadmin Page ─────────────────────────────────────────────────────
export default function SuperadminPage() {
  const toast = useToast();
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [showCreate, setShowCreate] = useState(false);
  const [selectedCompany, setSelectedCompany] = useState<{ id: string; name: string } | null>(null);

  const statsQuery = useQuery({
    queryKey: ["superadmin-stats"],
    queryFn: () => superadminApi.stats().then((r) => r.data),
  });

  const companiesQuery = useQuery({
    queryKey: ["superadmin-companies", page],
    queryFn: () => superadminApi.listCompanies(page).then((r) => r.data),
  });


  const stats = statsQuery.data;

  // Show employee panel if a company is selected
  if (selectedCompany) {
    return <EmployeePanel company={selectedCompany} onBack={() => setSelectedCompany(null)} />;
  }

  return (
    <div>
      <PageHeader
        title="Superadmin Panel"
        subtitle="Kelola semua perusahaan"
        action={
          <Button size="sm" onClick={() => setShowCreate(true)}>
            <Plus className="h-4 w-4 mr-1" /> Tambah Perusahaan
          </Button>
        }
      />

      <div className="p-4 space-y-4">
        {/* Stats cards */}
        <div className="grid grid-cols-2 gap-3">
          {[
            { label: "Total Perusahaan", value: stats?.total_companies ?? "—", Icon: Building2, color: "text-primary" },
            { label: "Total Karyawan",   value: stats?.total_employees ?? "—", Icon: Users, color: "text-violet-600" },
          ].map(({ label, value, Icon, color }) => (
            <div key={label} className="bg-white rounded-xl border border-border p-3 flex flex-col gap-1">
              <Icon className={cn("h-4 w-4", color)} />
              <p className="text-xl font-bold">{value}</p>
              <p className="text-[10px] text-muted-foreground leading-tight">{label}</p>
            </div>
          ))}
        </div>

        {/* Companies table */}
        {companiesQuery.isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <TableWrapper
            page={page}
            total={companiesQuery.data?.total ?? 0}
            perPage={companiesQuery.data?.per_page ?? 20}
            onPage={setPage}
          >
            <thead>
              <tr className="border-b border-border bg-muted/40">
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">Nama Perusahaan</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground hidden sm:table-cell">Kode</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground hidden md:table-cell">Lokasi</th>
                <th className="text-center px-4 py-2.5 text-xs font-semibold text-muted-foreground">Karyawan</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {(companiesQuery.data?.data ?? []).map((c: any) => (
                <Fragment key={c.id}>
                  <tr className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                          <Building2 className="h-3.5 w-3.5 text-primary" />
                        </div>
                        <span className="font-medium text-sm">{c.name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 hidden sm:table-cell">
                      <span className="text-xs font-mono bg-muted px-2 py-0.5 rounded">{c.code}</span>
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell text-xs text-muted-foreground">
                      {c.address
                        ? <span className="line-clamp-1 max-w-[200px]">{c.address}</span>
                        : <span className="italic">Belum diset</span>
                      }
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={() => setSelectedCompany({ id: c.id, name: c.name })}
                        className="inline-flex items-center gap-1 text-xs text-primary hover:underline font-medium"
                      >
                        <Users className="h-3.5 w-3.5" />
                        {c.employee_count ?? 0}
                      </button>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => setSelectedCompany({ id: c.id, name: c.name })}
                        className="text-muted-foreground hover:text-foreground transition-colors p-1"
                        title="Lihat karyawan"
                      >
                        <MoreHorizontal className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                </Fragment>
              ))}
              {(companiesQuery.data?.data ?? []).length === 0 && (
                <tr>
                  <td colSpan={6} className="text-center py-12">
                    <Building2 className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
                    <p className="text-sm text-muted-foreground">Belum ada perusahaan</p>
                    <button
                      onClick={() => setShowCreate(true)}
                      className="text-xs text-primary mt-1 hover:underline"
                    >
                      Tambah sekarang
                    </button>
                  </td>
                </tr>
              )}
            </tbody>
          </TableWrapper>
        )}
      </div>

      <CreateCompanyModal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onCreated={() => {
          qc.invalidateQueries({ queryKey: ["superadmin-companies"] });
          qc.invalidateQueries({ queryKey: ["superadmin-stats"] });
        }}
      />
    </div>
  );
}
