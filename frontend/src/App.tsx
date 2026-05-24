import React, { lazy, Suspense, useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ToastProvider } from "@/components/ui/toast";
import { Layout } from "@/components/Layout";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { useAuthStore } from "@/stores/auth";
import { Skeleton } from "@/components/ui/badge";
import { supabase } from "@/lib/supabase";

// Lazy import with automatic page reload on ChunkLoadError.
// Old service worker versions can cache stale chunk hashes; a reload
// fetches fresh HTML + chunks and resolves the mismatch.
function lazyPage<T extends React.ComponentType<any>>(
  factory: () => Promise<{ default: T }>
) {
  return lazy(() =>
    factory().catch((err) => {
      // Only reload for chunk/network errors, not for syntax errors
      if (err?.name === "ChunkLoadError" || /failed to fetch/i.test(err?.message ?? "")) {
        window.location.reload();
      }
      throw err;
    })
  );
}

const LoginPage         = lazyPage(() => import("@/pages/Login"));
const ResetPasswordPage = lazyPage(() => import("@/pages/ResetPassword"));
const Dashboard         = lazyPage(() => import("@/pages/Dashboard"));
const AttendancePage    = lazyPage(() => import("@/pages/Attendance"));
const LeavePage         = lazyPage(() => import("@/pages/Leave"));
const OvertimePage      = lazyPage(() => import("@/pages/Overtime"));
const ProfilePage       = lazyPage(() => import("@/pages/Profile"));
const AdminPage         = lazyPage(() => import("@/pages/Admin"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,             // 1 min — avoids redundant refetches during navigation
      gcTime: 5 * 60_000,            // 5 min cache lifetime
      retry: (failureCount, error: any) => {
        // Don't retry on 4xx errors (auth, not found, validation)
        const status = error?.response?.status;
        if (status >= 400 && status < 500) return false;
        return failureCount < 1;     // only 1 retry for 5xx / network errors
      },
      retryDelay: 1500,              // fixed 1.5s delay (not exponential)
      refetchOnWindowFocus: false,
    },
    mutations: {
      retry: 0,                      // never auto-retry mutations (double submit risk)
    },
  },
});

function PageLoader() {
  return (
    <div className="p-6 space-y-4">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-32 w-full" />
      <Skeleton className="h-20 w-full" />
    </div>
  );
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuthStore();
  return isAuthenticated ? <>{children}</> : <Navigate to="/login" replace />;
}

function AdminRoute({ children }: { children: React.ReactNode }) {
  const { profile } = useAuthStore();
  return profile?.role === "admin" ? <>{children}</> : <Navigate to="/" replace />;
}


import { trackPageView } from "@/lib/analytics";

function AppTracker() {
  useEffect(() => { trackPageView(); }, []);
  return null;
}

// On startup, proactively refresh the Supabase session if the stored JWT is
// expired or within 5 minutes of expiry. This prevents cascade 401s that
// would trigger ErrorBoundary when employees open the app in the morning.
function TokenRefresher() {
  const { isAuthenticated, token, setAuth, profile, logout } = useAuthStore();

  useEffect(() => {
    if (!isAuthenticated || !token || !profile) return;

    try {
      const payload = JSON.parse(atob(token.split(".")[1]));
      const expiresInMs = payload.exp * 1000 - Date.now();
      if (expiresInMs > 5 * 60 * 1000) return; // still fresh

      supabase.auth.refreshSession().then(({ data, error }) => {
        if (error || !data.session) { logout(); return; }
        setAuth(data.session.access_token, profile);
      });
    } catch {
      // malformed token — let the 401 interceptor handle it
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return null;
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <BrowserRouter>
          <AppTracker />
          <TokenRefresher />
          <ErrorBoundary>
          <Suspense fallback={<PageLoader />}>
            <Routes>
              {/* Public */}
              <Route path="/login"          element={<LoginPage />} />
              <Route path="/reset-password" element={<ResetPasswordPage />} />

              {/* Protected */}
              <Route
                element={
                  <ProtectedRoute>
                    <Layout />
                  </ProtectedRoute>
                }
              >
                <Route path="/"           element={<Dashboard />} />
                <Route path="/attendance" element={<AttendancePage />} />
                <Route path="/leave"      element={<LeavePage />} />
                <Route path="/overtime"   element={<OvertimePage />} />
                <Route path="/profile"    element={<ProfilePage />} />
                <Route
                  path="/admin"
                  element={
                    <AdminRoute>
                      <AdminPage />
                    </AdminRoute>
                  }
                />
              </Route>

              {/* Fallback */}
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Suspense>
          </ErrorBoundary>
        </BrowserRouter>
      </ToastProvider>
    </QueryClientProvider>
  );
}
