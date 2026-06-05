import axios from "axios";
import { useAuthStore } from "@/stores/auth";
import { supabase } from "@/lib/supabase";

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "http://localhost:8000",
  timeout: 12_000,
});

// Inject Bearer token from Zustand store, but never override an explicitly-set header.
// During login, authApi.me(newToken) passes the token explicitly before setAuth() is
// called, so the store still holds the previous user's token at that moment.
api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token;
  if (token && !config.headers.Authorization) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Handle 401: try silent refresh, then logout
let _refreshing = false;
let _queue: Array<{ resolve: (t: string) => void; reject: (e: unknown) => void }> = [];

api.interceptors.response.use(
  (res) => res,
  async (err) => {
    const original = err.config;

    // Force logout if account has been deactivated or is pending approval
    if (err.response?.status === 403 && (
      err.response?.data?.detail === "Akun Anda telah dinonaktifkan" ||
      err.response?.data?.detail === "pending_approval"
    )) {
      useAuthStore.getState().logout();
      window.location.href = "/login";
      return Promise.reject(err);
    }

    if (err.response?.status !== 401 || original._retry) {
      return Promise.reject(err);
    }
    original._retry = true;

    // Don't attempt refresh if there is no active Supabase session (e.g. the 401
    // came from /auth/login itself with wrong credentials — no session exists yet).
    const { data: sessionCheck } = await supabase.auth.getSession();
    if (!sessionCheck?.session) {
      return Promise.reject(err);
    }

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
      if (error || !data.session) {
        throw error ?? new Error("Session expired, please login again");
      }

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
  login:           (email: string, password: string, captchaToken?: string) =>
    api.post("/auth/login", { email, password, captcha_token: captchaToken }),
  me:              (token: string) =>
    api.get("/auth/me", { headers: { Authorization: `Bearer ${token}` } }),
  sendOtp:              (email: string, captchaToken?: string) =>
    api.post("/auth/send-otp", { email, captcha_token: captchaToken }),
  verifyOtp:            (email: string, token: string) =>
    api.post("/auth/verify-otp", { email, token }),
  resetPasswordOtp:     (email: string, token: string, new_password: string) =>
    api.post("/auth/reset-password-otp", { email, token, new_password }),
  changePasswordOtp:    (token: string, new_password: string) =>
    api.post("/auth/change-password-otp", { token, new_password }),
  verifyRegister:       (data: VerifyRegisterPayload) =>
    api.post("/auth/verify-register", data),
  verifyRegisterCompany: (data: VerifyRegisterOwnerPayload) =>
    api.post("/auth/verify-register-company", data),
  register:        (data: RegisterPayload, captchaToken?: string) =>
    api.post("/auth/register", { ...data, captcha_token: captchaToken }),
  registerCompany: (data: RegisterCompanyPayload, captchaToken?: string) =>
    api.post("/auth/register-company", { ...data, captcha_token: captchaToken }),
  updateProfile:   (data: { full_name?: string; phone?: string; position?: string }) =>
    api.patch("/auth/profile/me", data),
  changePassword:  (new_password: string) =>
    api.post("/auth/change-password", { new_password }),
};

export const attendanceApi = {
  today:        () => api.get("/attendance/today"),
  clockIn:      (lat: number, lng: number, notes?: string) =>
    api.post("/attendance/clock-in", { lat, lng, notes }),
  clockOut:     (lat: number, lng: number, notes?: string) =>
    api.post("/attendance/clock-out", { lat, lng, notes }),
  breakStart:   (lat: number, lng: number) =>
    api.post("/attendance/break-start", { lat, lng }),
  breakEnd:     (lat: number, lng: number) =>
    api.post("/attendance/break-end", { lat, lng }),
  history:      (page = 1, per_page = 10, date_from?: string, date_to?: string) =>
    api.get("/attendance/history", { params: { page, per_page, date_from, date_to } }),
  monthlyStats: () => api.get("/attendance/monthly-stats"),
  myLocations:  () => api.get("/attendance/my-locations"),
};

export const locationsApi = {
  list:         () => api.get("/admin/locations"),
  create:       (data: LocationPayload) => api.post("/admin/locations", data),
  update:       (id: string, data: Partial<LocationPayload> & { is_active?: boolean }) =>
    api.patch(`/admin/locations/${id}`, data),
  remove:       (id: string) => api.delete(`/admin/locations/${id}`),
  getForEmployee: (user_id: string) => api.get(`/admin/employees/${user_id}/locations`),
  assignToEmployee: (user_id: string, location_ids: string[]) =>
    api.put(`/admin/employees/${user_id}/locations`, { location_ids }),
};

export interface LocationPayload {
  name: string;
  address?: string;
  lat: number;
  lng: number;
  radius_meters?: number;
}

export const leaveApi = {
  create:  (data: LeavePayload) => api.post("/leave", data),
  list:    (page = 1, per_page = 10, date_from?: string, date_to?: string) =>
    api.get("/leave", { params: { page, per_page, date_from, date_to } }),
  balance: () => api.get("/leave/balance"),
  approve: (id: string, status: string, reviewer_note?: string) =>
    api.post(`/leave/${id}/approve`, { status, reviewer_note }),
  cancel:  (id: string) => api.delete(`/leave/${id}`),
};

export const overtimeApi = {
  create: (data: OvertimePayload) => api.post("/overtime", data),
  list:   (page = 1, per_page = 10, date_from?: string, date_to?: string) =>
    api.get("/overtime", { params: { page, per_page, date_from, date_to } }),
  approve: (id: string, status: string, reviewer_note?: string) =>
    api.post(`/overtime/${id}/approve`, { status, reviewer_note }),
  cancel:  (id: string) => api.delete(`/overtime/${id}`),
};

export const adminApi = {
  stats:           () => api.get("/admin/stats"),
  attendance:      (page = 1, date_from?: string, date_to?: string) =>
    api.get("/admin/attendance", { params: { page, per_page: 10, date_from, date_to } }),
  leave:           (page = 1, status_filter?: string, date_from?: string, date_to?: string) =>
    api.get("/admin/leave", { params: { page, per_page: 10, status_filter, date_from, date_to } }),
  overtime:        (page = 1, status_filter?: string, date_from?: string, date_to?: string) =>
    api.get("/admin/overtime", { params: { page, per_page: 10, status_filter, date_from, date_to } }),
  employees:       (page = 1, search?: string, is_active?: boolean) =>
    api.get("/admin/employees", { params: { page, per_page: 10, search: search || undefined, is_active } }),
  employeeAttendance: (user_id: string, page = 1) =>
    api.get(`/admin/employees/${user_id}/attendance`, { params: { page, per_page: 20 } }),
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
  monthlyReport: (year?: number, month?: number) =>
    api.get("/admin/report/monthly", { params: { year, month } }),
  exportMonthlyReport: (year?: number, month?: number) =>
    api.get("/admin/report/monthly/export", {
      params: { year, month },
      responseType: "blob",
    }),
};

export const demoApi = {
  reset: () => api.post("/demo/reset"),
};

export const correctionsApi = {
  create:  (data: { attendance_id: string; requested_clock_in?: string; requested_clock_out?: string; reason: string }) =>
    api.post("/corrections", data),
  list:    (page = 1, per_page = 20) => api.get("/corrections", { params: { page, per_page } }),
  adminList:   (page = 1, status_filter?: string, date_from?: string, date_to?: string) =>
    api.get("/corrections/admin", { params: { page, per_page: 10, status_filter, date_from, date_to } }),
  approve: (id: string, status: string, reviewer_note?: string) =>
    api.post(`/corrections/${id}/approve`, { status, reviewer_note }),
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
  work_saturday?: boolean;
  work_sunday?: boolean;
  flexible_attendance?: boolean;
  min_work_minutes?: number;
  multi_location?: boolean;
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

export interface VerifyRegisterPayload {
  email: string;
  token: string;
  full_name: string;
  company_code: string;
  phone?: string;
  position?: string;
}

export interface VerifyRegisterOwnerPayload {
  email: string;
  token: string;
  full_name: string;
  company_name: string;
  company_code: string;
  phone?: string;
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
