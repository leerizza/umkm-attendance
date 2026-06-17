# Donkap — Claude Code Context

## Project Overview
Donkap adalah aplikasi absensi karyawan berbasis GPS untuk UMKM. Solo dev project oleh Riza Gumelar.

## Stack
- **Backend:** FastAPI + Python → Railway
- **Database/Auth:** Supabase (Postgres + Supabase Auth)
- **Frontend (main app):** React + Vite → Vercel (`umkm-attendance` / `umkm-attendance-1-1`)
- **Frontend (admin):** React + Vite → Vercel (`umkm-attendance-admin`)
- **Landing page:** Static HTML + Tailwind CDN, folder `landing/` → Vercel (`umkm-attendance-landing`)
- **Demo app:** Vercel (project terpisah)

## Domain Architecture — JANGAN DIUBAH
| Domain | Tujuan |
|--------|--------|
| `donkap.space` / `www.donkap.space` | Main app (login) |
| `site.donkap.space` | Landing page |
| `admin.donkap.space` | Admin panel |
| `demo.donkap.space` | Demo app |

> Root domain (`donkap.space`) mengarah ke **app**, bukan landing page. Ini intentional.

## Action Plan Tracking
- File: `action_plan.xlsx` + `action_plan_assigned.xlsx`
- Update via script Python `openpyxl` — jangan edit manual
- Header row tidak selalu row 1, cari dinamis
- Format status: `✅ Selesai` atau variannya

## Git & PR Flow
- Satu branch per task/fix
- Setiap task: implement → update xlsx → commit → push → buat PR
- **Jangan merge PR tanpa instruksi eksplisit dari user**

## Analytics & SEO (Landing)
- **GA4:** `G-J29SX3S13G` — terpasang di semua 4 halaman landing
- **Microsoft Clarity:** `x7y8b9moqd` — terpasang di semua 4 halaman landing
- **Google Search Console:** Verified via `landing/googlec2616477f7553769.html` untuk `https://site.donkap.space/`
- **Sitemap:** `https://site.donkap.space/sitemap.xml` — sudah disubmit ke GSC
- **`landing/vercel.json`:** `cleanUrls` sudah dihapus (pernah break GSC verification). Rewrites explicit untuk `/perbandingan`, `/kebijakan-privasi`, `/syarat-layanan`.

## Security
- Rate limiting: `slowapi` dengan `default_limits=["200/minute"]`
- CORS: allowlist + `allow_origin_regex` untuk `*.vercel.app` + custom `CORSErrorMiddleware`
- Multi-tenant isolation via `company_id` — konsisten di semua router
- OWASP manual review: selesai, report di `docs/security/owasp-code-review.md`

## Working Notes
- FAQ rich snippet "No items detected" di Google — ini bukan bug, Google policy sejak Agustus 2023 restrict FAQ rich results hanya untuk government/health sites
- Legal pages (`kebijakan-privasi.html`, `syarat-layanan.html`) masih draft — belum review legal (khususnya UU PDP Indonesia)
- Vercel free tier: build rate limit "retry in 24 hours" bisa muncul kalau terlalu banyak deploy dalam satu hari
