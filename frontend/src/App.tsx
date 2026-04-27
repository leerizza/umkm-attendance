import { lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ToastProvider } from "@/components/ui/toast";
import { Layout } from "@/components/Layout";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { useAuthStore } from "@/stores/auth";
import { Skeleton } from "@/components/ui/badge";

// Lazy-loaded pages (code splitting)
const LoginPage         = lazy(() => import("@/pages/Login"));
const ResetPasswordPage = lazy(() => import("@/pages/ResetPassword"));
const Dashboard         = lazy(() => import("@/pages/Dashboard"));
const AttendancePage    = lazy(() => import("@/pages/Attendance"));
const LeavePage         = lazy(() => import("@/pages/Leave"));
const OvertimePage      = lazy(() => import("@/pages/Overtime"));
const ProfilePage       = lazy(() => import("@/pages/Profile"));
const AdminPage         = lazy(() => import("@/pages/Admin"));
const SuperadminPage    = lazy(() => import("@/pages/Superadmin"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,             // 1 min — avoids redundant refetches during navigation
      gcTime: 5 * 60_000,            // 5 min cache lifetime
      retry: 2,
      retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 10_000), // 1s → 2s → 4s …
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
  const isAdmin = profile?.role === "admin" || profile?.role === "superadmin";
  return isAdmin ? <>{children}</> : <Navigate to="/" replace />;
}

function SuperadminRoute({ children }: { children: React.ReactNode }) {
  const { profile } = useAuthStore();
  return profile?.role === "superadmin" ? <>{children}</> : <Navigate to="/" replace />;
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <BrowserRouter>
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
                <Route
                  path="/superadmin"
                  element={
                    <SuperadminRoute>
                      <SuperadminPage />
                    </SuperadminRoute>
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
