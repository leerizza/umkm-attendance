---
title: Audit Keamanan — Manual Code Review (substitusi OWASP ZAP)
date: 2026-06-16
scope: backend/ (FastAPI), landing/, frontend/ auth flow
---

# Audit Keamanan — Manual Code Review

> **Catatan scope:** Task action plan #31 meminta "Audit keamanan dengan OWASP ZAP".
> ZAP adalah dynamic scanner yang butuh target live + tool ZAP berjalan — tidak bisa
> dieksekusi langsung di environment ini. Sebagai gantinya, dilakukan **manual code
> review** terhadap backend FastAPI dengan checklist OWASP Top 10, fokus pada
> multi-tenant data isolation, auth, rate limiting, dan CORS. Untuk coverage penuh,
> tetap disarankan menjalankan ZAP scan terhadap staging/production URL secara terpisah.

## Ringkasan

Multi-tenant data isolation **konsisten dan baik** di seluruh router yang diperiksa —
setiap query yang menyentuh record spesifik (attendance, leave, overtime, corrections,
locations, employees) selalu memvalidasi `company_id` cocok dengan company admin/user
yang sedang login sebelum membaca/menulis. Tidak ditemukan jalur yang memungkinkan satu
company mengakses data company lain.

Dua temuan diperbaiki langsung di branch ini (low-risk, tidak mengubah behavior untuk
trafik legit). Sisanya didokumentasikan sebagai rekomendasi.

## Temuan & Status

### 1. ✅ Diperbaiki — `/auth/refresh` tidak punya rate limit
**File:** `backend/routers/auth.py`
Endpoint refresh token sebelumnya tidak punya decorator `@limiter.limit(...)`, berbeda
dari endpoint auth lain (`/login` 10/min, `/send-otp` 3/min, dst). Endpoint ini hanya
kena `default_limits=["200/minute"]` dari `Limiter`, jauh lebih permisif — celah untuk
brute-force terhadap refresh token yang dicuri/leaked.
**Fix:** ditambahkan `@limiter.limit("20/minute")` ke `refresh_token`.

### 2. ✅ Diperbaiki — CORS error-path mereplika origin tanpa allowlist
**File:** `backend/main.py`
`CORSErrorMiddleware` (fallback untuk unhandled 500 error) sebelumnya mereflect literal
header `Origin` request sebagai `Access-Control-Allow-Origin`, dikombinasikan dengan
`Access-Control-Allow-Credentials: true` — tanpa cek allowlist. Ini membuat policy di
error-path LEBIH permisif dari success-path (yang sudah pakai allowlist + regex
`*.vercel.app`). Origin manapun (termasuk milik attacker) akan diterima begitu request
mereka memicu 500 di server.
**Fix:** ditambahkan helper `_is_allowed_origin()` yang menggunakan allowlist
(`settings.allowed_origins`) + regex `*.vercel.app` yang sama dengan `CORSMiddleware`
utama. Header CORS hanya disertakan jika origin lolos cek; jika tidak, response 500
dikirim tanpa header CORS sama sekali (browser akan block read, sesuai default-deny).

### 3. ⚠️ Rekomendasi — CORS regex `*.vercel.app` terlalu luas
**File:** `backend/main.py`, `backend/config.py`
`allow_origin_regex=r"https://.*\.vercel\.app"` dikombinasikan dengan
`allow_credentials=True` berarti SEMUA subdomain `*.vercel.app` dipercaya untuk
credentialed request — termasuk app Vercel siapapun, bukan cuma preview deployment
project ini. Karena siapapun bisa deploy ke `*.vercel.app` gratis, ini secara teori
memungkinkan attacker membuat app di `evil-xyz.vercel.app` yang mengirim
credentialed request ke API dan membaca response (jika korban login dan browser-nya
mengirim cookie/token — tapi karena auth di app ini pakai Bearer token di
localStorage, bukan cookie, risiko praktis lebih rendah karena attacker tidak otomatis
punya token korban).
**Belum diperbaiki** karena mengetatkan regex (misal ke
`https://umkm-attendance-[a-z0-9-]+\.vercel\.app` atau project slug spesifik) berisiko
memutus preview deployment yang sah jika nama project/slug berubah. **Perlu konfirmasi
project slug Vercel yang stabil dulu sebelum diubah.**

### 4. ⚠️ Rekomendasi — `/auth/change-password` tidak re-verifikasi
**File:** `backend/routers/auth.py`
Endpoint `change-password` (non-OTP) hanya butuh session valid (Bearer token), tidak
minta password lama atau OTP ulang. Jika token aktif dicuri (XSS, device yang lupa
logout), attacker bisa mengganti password tanpa tahu password asli — sementara ada
varian `/change-password-otp` yang lebih aman. Severity rendah karena tetap butuh
token valid yang sudah authenticated terlebih dahulu.
**Rekomendasi:** pertimbangkan deprecate endpoint non-OTP ini di frontend, arahkan
semua flow ganti password lewat `/change-password-otp`.

### 5. ℹ️ Observasi positif — Isolasi multi-tenant
Diperiksa di: `admin.py`, `attendance.py`, `leave.py`, `overtime.py` (pola sama dengan
`leave.py`), `corrections.py`, `locations.py`, `superadmin.py`, `demo.py`.
Semua endpoint yang mengoperasikan record by-ID melakukan pola:
```python
rec = supabase.table(...).select(...).eq("id", record_id).single().execute()
if not rec.data or rec.data["company_id"] != admin["company_id"]:
    raise HTTPException(404, ...)
```
Tidak ada IDOR/cross-tenant leak yang ditemukan pada endpoint yang diperiksa.

### 6. ℹ️ Observasi — Demo account scoping aman
`backend/routers/demo.py` membatasi `/demo/reset` hanya untuk email yang match pattern
`demo.*@donkap.space`, dan hanya menghapus data milik `company_id` user yang login —
tidak bisa dipakai untuk wipe data company lain.

## Yang Belum Tercakup (di luar scope review ini)

- Dynamic scan (XSS reflected/stored, SSRF, dependency CVE) — butuh ZAP/Snyk berjalan
  terhadap target live.
- Row-level security (RLS) policy di Supabase langsung (review ini hanya melihat kode
  aplikasi, bukan konfigurasi RLS di database).
- Review `frontend/` secara menyeluruh untuk XSS (cek `dangerouslySetInnerHTML` dll).
- Load/rate-limit testing aktual (limiter hanya direview dari kode, bukan diuji beban).

## Rekomendasi Selanjutnya

1. Jalankan ZAP baseline scan terhadap `https://api.donkap.space` (atau domain backend
   yang sesuai) untuk coverage dynamic-scan yang sebenarnya.
2. Konfirmasi project slug Vercel yang stabil, lalu persempit `allow_origin_regex`.
3. Audit RLS policy di Supabase dashboard untuk tabel-tabel utama (`attendance`,
   `leave_requests`, `profiles`, dst) sebagai defense-in-depth di luar app-layer checks.
