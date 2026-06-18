/**
 * AttendanceNotifier — invisible component mounted inside Layout.
 *
 * Reminders (repeat every 10 minutes while app is open):
 *   • Clock-in  : 07:00 WIB → until user clocks in or 09:30 WIB
 *   • Clock-out : 18:00 WIB → until user clocks out or 20:00 WIB
 *
 * Uses localStorage to track last notification time so it never
 * spams more than once per INTERVAL_MS even on rapid re-renders.
 */
import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { attendanceApi } from "@/lib/api";
import { useAuthStore } from "@/stores/auth";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";

const INTERVAL_MS   = 10 * 60 * 1000; // 10 minutes between notifications
const CHECK_EVERY   = 60_000;          // check clock every 1 minute

const KEY_IN  = "notif_last_in";
const KEY_OUT = "notif_last_out";

/** Returns current time in WIB as { h, m, totalMin } */
function wibNow() {
  const d = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Jakarta" }));
  const h = d.getHours();
  const m = d.getMinutes();
  return { h, m, totalMin: h * 60 + m };
}

async function askPermission() {
  if (!("Notification" in window)) return;
  if (Notification.permission === "default") {
    await Notification.requestPermission();
  }
}

function notify(title: string, body: string, tag: string) {
  if (!("Notification" in window)) return;
  if (Notification.permission !== "granted") return;

  const options: NotificationOptions = { body, icon: "/favicon.png", tag };

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.ready
      .then((reg) => reg.showNotification(title, options))
      .catch(() => {
        // SW not controlling this page yet — fall back to direct API
        try { new Notification(title, options); } catch { /* unsupported */ }
      });
  } else {
    try { new Notification(title, options); } catch { /* unsupported */ }
  }
}

export function AttendanceNotifier() {
  const { profile, isAuthenticated } = useAuthStore();
  const isOnline = useOnlineStatus();
  const permAsked = useRef(false);

  // Poll today's attendance every 2 minutes
  const { data } = useQuery({
    queryKey: ["attendance-today-notifier"],
    queryFn: () => attendanceApi.today().then((r) => r.data),
    refetchInterval: 2 * 60_000,
    enabled: isAuthenticated && isOnline,
    staleTime: 60_000,
  });

  // Ask permission once
  useEffect(() => {
    if (!isAuthenticated || permAsked.current) return;
    permAsked.current = true;
    askPermission();
  }, [isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated) return;

    const clockedIn  = !!data?.record?.clock_in;
    const clockedOut = !!data?.record?.clock_out;

    // Parse company work hours, fall back to 08:00 / 17:00
    const workStart = profile?.companies?.work_start ?? "08:00";
    const workEnd   = profile?.companies?.work_end   ?? "17:00";
    const [wsH, wsM] = workStart.split(":").map(Number);
    const [weH, weM] = workEnd.split(":").map(Number);

    // Clock-in window: 07:00 → work_start + 90 min
    const inWindowStart  = 7 * 60;
    const inWindowEnd    = wsH * 60 + wsM + 90;

    // Clock-out window: work_end → work_end + 120 min (max 22:00)
    const outWindowStart = weH * 60 + weM;
    const outWindowEnd   = Math.min(weH * 60 + weM + 120, 22 * 60);

    function check() {
      const { totalMin } = wibNow();
      const now = Date.now();

      // ── Clock-in reminder ─────────────────────────────────────
      if (!clockedIn && totalMin >= inWindowStart && totalMin <= inWindowEnd) {
        const last = parseInt(localStorage.getItem(KEY_IN) ?? "0", 10);
        if (now - last >= INTERVAL_MS) {
          notify(
            "⏰ Jangan lupa absen masuk!",
            "Buka Donkap dan lakukan clock-in sekarang.",
            "clock-in-reminder",
          );
          localStorage.setItem(KEY_IN, String(now));
        }
      }

      // ── Clock-out reminder ────────────────────────────────────
      if (clockedIn && !clockedOut && totalMin >= outWindowStart && totalMin <= outWindowEnd) {
        const last = parseInt(localStorage.getItem(KEY_OUT) ?? "0", 10);
        if (now - last >= INTERVAL_MS) {
          notify(
            "🏠 Jangan lupa absen keluar!",
            "Sudah waktunya clock-out. Buka Donkap.",
            "clock-out-reminder",
          );
          localStorage.setItem(KEY_OUT, String(now));
        }
      }
    }

    check(); // run immediately when status changes
    const timer = setInterval(check, CHECK_EVERY);
    return () => clearInterval(timer);
  }, [
    isAuthenticated,
    data?.record?.clock_in,
    data?.record?.clock_out,
    profile?.companies?.work_start,
    profile?.companies?.work_end,
  ]);

  return null; // no UI
}
