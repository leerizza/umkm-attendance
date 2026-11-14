import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MailPlus, X, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/components/ui/toast";
import { adminApi } from "@/lib/api";
import { fmtDate, getErrMsg, cn } from "@/lib/utils";

interface Invitation {
  id: string;
  email: string;
  role: "employee" | "admin";
  position?: string | null;
  status: "pending" | "accepted" | "expired";
  expires_at: string;
  accepted_at?: string | null;
}

const STATUS_STYLE: Record<Invitation["status"], { label: string; cls: string }> = {
  pending:  { label: "Menunggu",    cls: "bg-amber-50 text-amber-700" },
  accepted: { label: "Bergabung",   cls: "bg-emerald-50 text-emerald-700" },
  expired:  { label: "Kedaluwarsa", cls: "bg-muted text-muted-foreground" },
};

/** Split pasted text (newlines, commas, spaces, semicolons) into emails. */
function parseEmails(text: string): string[] {
  return Array.from(new Set(
    text.split(/[\s,;]+/).map((e) => e.trim().toLowerCase()).filter(Boolean),
  ));
}

/**
 * "Undang karyawan": the invited email joins this company by signing in with
 * Google ("Masuk dengan Google") — no password or company code needed.
 */
export function InvitationsPanel() {
  const qc = useQueryClient();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [emailsText, setEmailsText] = useState("");
  const [role, setRole] = useState<"employee" | "admin">("employee");
  const [position, setPosition] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["admin-invitations"],
    queryFn: () => adminApi.invitations().then((r) => r.data.data as Invitation[]),
  });
  const invitations = data ?? [];
  const pendingCount = invitations.filter((i) => i.status === "pending").length;

  const create = useMutation({
    mutationFn: () => adminApi.createInvitations(parseEmails(emailsText), role, position.trim()),
    onSuccess: (res) => {
      const { created, renewed, skipped } = res.data as {
        created: Invitation[]; renewed: Invitation[]; skipped: { email: string; reason: string }[];
      };
      const sent = created.length + renewed.length;
      if (sent) toast.success("Undangan terkirim", `${sent} email diundang. Mereka bisa langsung "Masuk dengan Google".`);
      if (skipped.length) {
        toast.error("Sebagian dilewati", skipped.map((s) => `${s.email}: ${s.reason}`).join("\n"), 10000);
      }
      setEmailsText("");
      setPosition("");
      qc.invalidateQueries({ queryKey: ["admin-invitations"] });
    },
    onError: (err) => toast.error("Gagal mengundang", getErrMsg(err)),
  });

  const revoke = useMutation({
    mutationFn: (id: string) => adminApi.revokeInvitation(id),
    onSuccess: () => {
      toast.success("Undangan dibatalkan");
      qc.invalidateQueries({ queryKey: ["admin-invitations"] });
    },
    onError: (err) => toast.error("Gagal membatalkan", getErrMsg(err)),
  });

  const emailCount = parseEmails(emailsText).length;

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="w-full flex items-center justify-between text-left"
        >
          <span className="flex items-center gap-2 text-sm font-semibold">
            <MailPlus className="h-4 w-4 text-primary" />
            Undang Karyawan
            {pendingCount > 0 && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-700 font-semibold">
                {pendingCount} menunggu
              </span>
            )}
          </span>
          {open ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
        </button>

        {open && (
          <>
            <p className="text-xs text-muted-foreground">
              Masukkan email Google karyawan (Gmail juga bisa). Mereka bergabung ke perusahaan ini dengan
              tombol <strong>Masuk dengan Google</strong>, tanpa password atau kode perusahaan.
              Undangan berlaku 30 hari.
            </p>
            <form
              onSubmit={(e) => { e.preventDefault(); if (emailCount) create.mutate(); }}
              className="space-y-2"
            >
              <textarea
                value={emailsText}
                onChange={(e) => setEmailsText(e.target.value)}
                placeholder={"budi@gmail.com\nsiti@gmail.com"}
                rows={3}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
              />
              <div className="flex flex-wrap gap-2 items-center">
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value as "employee" | "admin")}
                  className="h-8 text-xs border border-border rounded-lg px-2 bg-background focus:outline-none focus:ring-1 focus:ring-primary"
                >
                  <option value="employee">Karyawan</option>
                  <option value="admin">Admin</option>
                </select>
                <input
                  value={position}
                  onChange={(e) => setPosition(e.target.value)}
                  placeholder="Jabatan (opsional)"
                  maxLength={100}
                  className="h-8 flex-1 min-w-[140px] rounded-lg border border-border bg-background px-3 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                />
                <Button type="submit" size="sm" loading={create.isPending} disabled={!emailCount || emailCount > 50}>
                  Undang{emailCount > 1 ? ` ${emailCount} email` : ""}
                </Button>
              </div>
              {emailCount > 50 && <p className="text-xs text-red-500">Maksimal 50 email sekali kirim.</p>}
            </form>

            {isLoading ? (
              <p className="text-xs text-muted-foreground">Memuat undangan…</p>
            ) : invitations.length > 0 && (
              <ul className="divide-y divide-border/50 border-t border-border/50">
                {invitations.map((inv) => (
                  <li key={inv.id} className="flex items-center gap-2 py-2 text-xs">
                    <span className="flex-1 min-w-0 truncate" title={inv.email}>{inv.email}</span>
                    <span className="text-muted-foreground hidden sm:inline">
                      {inv.role === "admin" ? "Admin" : "Karyawan"}{inv.position ? ` · ${inv.position}` : ""}
                    </span>
                    <span className={cn("px-2 py-0.5 rounded-full font-medium", STATUS_STYLE[inv.status].cls)}>
                      {STATUS_STYLE[inv.status].label}
                    </span>
                    <span className="text-muted-foreground hidden sm:inline w-24 text-right">
                      {inv.status === "accepted" && inv.accepted_at ? fmtDate(inv.accepted_at) : `s/d ${fmtDate(inv.expires_at)}`}
                    </span>
                    {inv.status !== "accepted" ? (
                      <button
                        type="button"
                        onClick={() => revoke.mutate(inv.id)}
                        disabled={revoke.isPending}
                        title="Batalkan undangan"
                        className="text-muted-foreground hover:text-red-500 disabled:opacity-40"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    ) : <span className="w-3.5" />}
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
