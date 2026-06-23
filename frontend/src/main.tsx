import React from "react";
import ReactDOM from "react-dom/client";
import * as Sentry from "@sentry/react";
import App from "./App";
import "./index.css";

const sentryDsn = import.meta.env.VITE_SENTRY_DSN;
if (sentryDsn) {
  Sentry.init({
    dsn: sentryDsn,
    environment: import.meta.env.MODE,
    tracesSampleRate: 0.1,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 1.0,
    // replayIntegration excluded here — loaded from CDN after idle to keep
    // ~40 KB out of the initial bundle
    integrations: [Sentry.browserTracingIntegration()],
    ignoreErrors: ["ChunkLoadError", /failed to fetch dynamically imported/i],
  });
  // Load replay integration after browser is idle
  (window.requestIdleCallback ?? setTimeout)(() => {
    Sentry.lazyLoadIntegration("replayIntegration")
      .then((replayIntegration) => Sentry.addIntegration(replayIntegration()))
      .catch(() => {});
  });
}

// Register service worker
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .catch(() => { /* non-critical: SW unavailable in this context */ });
  });
}

// PWA install prompt
let deferredPrompt: any = null;
window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  deferredPrompt = e;
  // Expose globally for Install button
  (window as any).__pwaPrompt = deferredPrompt;
});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
