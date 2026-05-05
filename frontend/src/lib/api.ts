import axios from "axios";
import { useAuthStore } from "@/stores/auth";
import { supabase } from "@/lib/supabase";

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "http://localhost:8000",
  timeout: 15_000,
});

// Inject Bearer token from Zustand store on every request
api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Handle 401: try silent refresh, then logout
let _refreshing = false;
let _queue: Array<{ resolve: (t: string) => void; reject: (e: unknown) => void }> = [];

api.interceptors.response.use(
  (res) => res,
  async (err) => {
    const original = err.config;
    if (err.response?.status !== 401 || original._retry) {
      return Promise.reject(err);
    }
    original._retry = true;

    if (_refreshing) {
      return new Promise<string>((resolve, reject) => {
        _queue.push({ resolve, reject });
      }).then((token) => {
        original.headers.Authorization = `Bearer ${token}`;
        return api(original);
      });
    }

    _refreshing = true;
    try {
      const { data, error } = await supabase.auth.refreshSession();
      if (error || !data.session) throw error;

      const newToken = data.session.access_token;
      const store = useAuthStore.getState();
      store.setAuth(newToken, store.profile!);

      _queue.forEach(({ resolve }) => resolve(newToken));
      _queue = [];

      original.headers.Authorization = `Bearer ${newToken}`;
      return api(original);
    } catch (refreshErr) {
      _queue.forEach(({ reject }) => reject(refreshErr));
      _queue = [];
      useAuthStore.getState().logout();
      window.location.href = "/login";
      return Promise.reject(refreshErr);
    } finally {
      _refreshing = false;
    }
  }
);

// ─── Typed helpers ───────────────────────────────────────────────────────────

export const authApi = {
  login:           (email: string, password: string) =>
    api.post("/auth/login", { email, password }),
  register:        (data: RegisterPayload) =>
    api.post("/auth/register", data),
  registerCompany: (data: RegisterCompanyPayload) =>
    api.post("/auth/register-company", data),
  updateProfile:   (data: { full_name?: string; phone?: string; position?: string }) =>
    api.patch("/auth/profile/me", data),
};

export const attendanceApi = {
  today:        () => api.get("/attendance/today"),
  clockIn:      (lat: number, lng: number, notes?: string) =>
    api.post("/attendance/clock-in", { lat, lng, notes }),
  clockOut:     (lat: number, lng: number, notes?: string) =>
    api.post("/attendance/clock-out", { lat, lng, notes }),
  history:      (page = 1, per_page = 20) =>
    api.get("/attendance/history", { params: { page, per_page } }),
  monthlyStats: () => api.get("/attendance/monthly-stats"),
};

export const leaveApi = {
  create:  (data: LeavePayload) => api.post("/leave", data),
  list:    (page = 1, per_page = 20) =>
    api.get("/leave", { params: { page, per_page } }),
  balance: () => api.get("/leave/balance"),
  approve: (id: string, status: string, reviewer_note?: string) =>
    api.post(`/leave/${id}/approve`, { status, reviewer_note }),
};

export const overtimeApi = {
  create: (data: OvertimePayload) => api.post("/overtime", data),
  list:   (page = 1, per_page = 20) =>
    api.get("/overtime", { params: { page, per_page } }),
  approve: (id: string, status: string, reviewer_note?: string) =>
    api.post(`/overtime/${id}/approve`, { status, reviewer_note }),
};

export const adminApi = {
  stats:           () => api.get("/admin/stats"),
  attendance:      (page = 1, date_filter?: string) =>
    api.get("/admin/attendance", { params: { page, date_filter } }),
  leave:           (page = 1, status_filter?: string) =>
    api.get("/admin/leave", { params: { page, status_filter } }),
  overtime:        (page = 1, status_filter?: string) =>
    api.get("/admin/overtime", { params: { page, status_filter } }),
  employees:       (page = 1) =>
    api.get("/admin/employees", { params: { page } }),
  getCompany:           () => api.get("/admin/company"),
  updateCompany:        (data: CompanyUpdatePayload) => api.patch("/admin/company", data),
  exportAttendance:     (date_from?: string, date_to?: string) =>
    api.get("/admin/attendance/export", {
      params: { date_from, date_to },
      responseType: "blob",
    }),
  toggleEmployeeActive: (id: string, is_active: boolean) =>
    api.patch(`/admin/employees/${id}/active`, null, { params: { is_active } }),
  updateEmployeeRole: (id: string, role: string) =>
    api.patch(`/admin/employees/${id}/role`, null, { params: { role } }),
  correctAttendance: (id: string, data: { clock_in?: string; clock_out?: string; notes?: string }) =>
    api.patch(`/admin/attendance/${id}`, data),
};

export const correctionsApi = {
  create:  (data: { attendance_id: string; requested_clock_in?: string; requested_clock_out?: string; reason: string }) =>
    api.post("/corrections", data),
  list:    (page = 1) => api.get("/corrections", { params: { page } }),
  adminList:   (page = 1, status_filter?: string) =>
    api.get("/corrections/admin", { params: { page, status_filter } }),
  approve: (id: string, status: string, reviewer_note?: string) =>
    api.post(`/corrections/${id}/approve`, { status, reviewer_note }),
};

export const superadminApi = {
  stats:           () => api.get("/superadmin/stats"),
  listCompanies:   (page = 1) => api.get("/superadmin/companies", { params: { page } }),
  createCompany:   (data: CompanyCreatePayload) => api.post("/superadmin/companies", data),
  getCompany:      (id: string) => api.get(`/superadmin/companies/${id}`),
  updateCompany:   (id: string, data: Partial<CompanyCreatePayload>) =>
    api.patch(`/superadmin/companies/${id}`, data),
  listEmployees:   (company_id: string, page = 1) =>
    api.get(`/superadmin/companies/${company_id}/employees`, { params: { page } }),
  updateRole:      (company_id: string, user_id: string, role: string) =>
    api.patch(`/superadmin/companies/${company_id}/employees/${user_id}/role`, null, { params: { role } }),
};

export interface CompanyCreatePayload {
  name: string;
  code: string;
  address?: string;
  lat?: number;
  lng?: number;
  radius_meters?: number;
  work_start?: string;
  work_end?: string;
}

export interface CompanyUpdatePayload {
  name?: string;
  address?: string;
  lat?: number;
  lng?: number;
  radius_meters?: number;
  work_start?: string;
  work_end?: string;
}

// ─── Types ───────────────────────────────────────────────────────────────────

export interface RegisterPayload {
  email: string;
  password: string;
  full_name: string;
  company_code: string;
  phone?: string;
  position?: string;
}

export interface RegisterCompanyPayload {
  email: string;
  password: string;
  full_name: string;
  phone?: string;
  company_name: string;
  company_code: string;
}

export interface LeavePayload {
  leave_type: string;
  start_date: string;
  end_date: string;
  reason: string;
}

export interface OvertimePayload {
  date: string;
  start_time: string;
  end_time: string;
  reason: string;
}
