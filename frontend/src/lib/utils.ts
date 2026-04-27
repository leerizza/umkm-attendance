import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { format, formatDistanceToNow, parseISO } from "date-fns";
import { id as localeId } from "date-fns/locale";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function fmtDate(date: string | Date, fmt = "dd MMM yyyy") {
  const d = typeof date === "string" ? parseISO(date) : date;
  return format(d, fmt, { locale: localeId });
}

export function fmtTime(datetime: string | Date) {
  const d = typeof datetime === "string" ? parseISO(datetime) : datetime;
  return format(d, "HH:mm");
}

export function fmtRelative(datetime: string | Date) {
  const d = typeof datetime === "string" ? parseISO(datetime) : datetime;
  return formatDistanceToNow(d, { addSuffix: true, locale: localeId });
}

export function fmtDuration(minutes: number) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}j`;
  return `${h}j ${m}m`;
}

export function statusColor(status: string): string {
  const map: Record<string, string> = {
    present:     "badge-present",
    late:        "badge-late",
    early_leave: "badge-late",
    absent:      "badge-absent",
    pending:     "badge-pending",
    approved:    "badge-approved",
    rejected:    "badge-rejected",
  };
  return map[status] ?? "badge-pending";
}

export function statusLabel(status: string): string {
  const map: Record<string, string> = {
    present:     "Hadir",
    late:        "Terlambat",
    early_leave: "Pulang Awal",
    absent:      "Absen",
    pending:     "Menunggu",
    approved:    "Disetujui",
    rejected:    "Ditolak",
    annual:      "Cuti Tahunan",
    sick:        "Sakit",
    personal:    "Keperluan Pribadi",
    other:       "Lainnya",
  };
  return map[status] ?? status;
}

export function getInitials(name: string) {
  return name
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

/** Extract error message from Axios error */
export function getErrMsg(err: unknown): string {
  if (typeof err === "object" && err !== null) {
    const e = err as any;
    return e?.response?.data?.detail
      ?? e?.response?.data?.message
      ?? e?.message
      ?? "Terjadi kesalahan";
  }
  return "Terjadi kesalahan";
}
