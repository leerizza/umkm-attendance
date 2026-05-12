import { IS_DEMO } from "@/lib/demo";

const API = (import.meta.env.VITE_API_URL as string) || "http://localhost:8000";

export type AnalyticsEvent =
  | "page_view"
  | "demo_login"
  | "register_company"
  | "register_employee";

/**
 * Fire-and-forget analytics event. Uses plain fetch (not axios) so it never
 * triggers auth interceptors and never blocks or errors the caller.
 */
export function trackEvent(event: AnalyticsEvent): void {
  const source = IS_DEMO ? "demo" : "app";
  fetch(`${API}/analytics/event`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ event_type: event, source }),
  }).catch(() => {});
}

/** Track a page view once per browser session (survives SPA navigation). */
export function trackPageView(): void {
  const key = "__donkap_pv";
  if (!sessionStorage.getItem(key)) {
    sessionStorage.setItem(key, "1");
    trackEvent("page_view");
  }
}
