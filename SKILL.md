---
name: action-plan-role-mapper
description: |
  Memetakan setiap task dalam action plan SaaS/produk ke role atau tim yang tepat
  berdasarkan skill yang dibutuhkan untuk mengerjakannya. Gunakan skill ini ketika
  user sudah punya action plan (dari audit, roadmap, atau backlog) dan ingin tahu:

  - Tim / role mana yang harus mengerjakan setiap task?
  - Siapa owner, siapa yang support, siapa yang di-consult, siapa yang di-inform? (RACI)
  - Berapa orang yang dibutuhkan per task?
  - Apakah ada dependency antar tim sebelum task bisa dimulai?
  - Bagaimana distribusi beban kerja per tim/role?
  - Task mana yang bisa paralel vs harus sekuensial?

  Trigger phrases:
  - "assign task ini ke tim yang tepat"
  - "siapa yang harus ngerjain ini?"
  - "petakan ke role / departemen"
  - "buat RACI untuk action plan ini"
  - "distribute task ke tim"
  - "tim mana yang handle bagian ini?"
  - "buat assignment matrix"
  - "role yang dibutuhkan untuk ini apa?"
  - "breakdown task per departemen"
  - "siapa owner dari setiap task?"
---

# Action Plan Role Mapper

Tugasmu: baca action plan yang sudah ada, pahami setiap task secara teknis dan
fungsional, lalu petakan ke role/tim yang paling tepat untuk mengerjakannya —
lengkap dengan RACI, dependency, dan distribusi beban kerja.

---

## LANGKAH 1 — BACA ACTION PLAN

Cari action plan dari:
- Conversation history (scroll ke atas)
- File yang diupload user (.xlsx, .csv, .md, .txt)
- Teks yang di-paste langsung

Untuk setiap task, ekstrak:
```
- Deskripsi task
- Kategori (jika ada): Tech / Marketing / Product / Security / dll
- Prioritas (jika ada)
- Deadline (jika ada)
- Estimasi effort (jika ada)
```

Jika action plan belum ada → minta user paste atau upload dulu sebelum lanjut.

---

## LANGKAH 2 — TANYA KONTEKS TIM

Sebelum assign, tanya (atau infer dari context):

```
1. Berapa ukuran tim sekarang?
   [ ] Solo founder (semua dikerjakan sendiri)
   [ ] Tim kecil 2–5 orang (multi-hat, 1 orang bisa pegang beberapa role)
   [ ] Tim 6–20 orang (sudah ada spesialisasi)
   [ ] Tim 20+ orang (ada departemen tersendiri)

2. Role apa saja yang sudah ADA di tim?
   (misal: ada 1 backend dev, 1 frontend dev, tidak ada designer)

3. Ada budget untuk hire atau outsource?
   [ ] Tidak ada — hanya pakai tim internal
   [ ] Ada — bisa hire freelancer untuk task tertentu
   [ ] Ada — bisa hire full-time untuk gap yang kritis

4. Adakah role yang TIDAK BOLEH di-assign ke luar?
   (misal: security task harus internal, tidak boleh freelance)
```

Jika user tidak menjawab → default ke **Mode Startup** (tim kecil, multi-hat).

---

## LANGKAH 3 — ROLE TAXONOMY

Gunakan role library ini sebagai referensi assignment.
Sesuaikan dengan ukuran tim user (role bisa digabung untuk tim kecil).

### 🔧 Engineering
| Role | Tanggung Jawab Utama | Skill Kunci |
|------|---------------------|-------------|
| **Frontend Dev** | UI, UX implementation, landing page, web components | React/Vue/HTML/CSS, PWA |
| **Backend Dev** | API, business logic, database, authentication | Node/Python/Go, REST/GraphQL |
| **Full-Stack Dev** | End-to-end feature, cocok untuk tim kecil | Frontend + Backend |
| **Mobile Dev** | Native atau hybrid mobile app | React Native, Flutter, Swift, Kotlin |
| **DevOps / Infra** | Deployment, CI/CD, monitoring, scaling, server | Docker, K8s, Railway, Supabase, AWS |
| **Data Engineer** | Pipeline data, ETL, database schema, analytics infra | SQL, dbt, Airflow, BigQuery |
| **Data Scientist** | Model ML, analisis prediktif, AI features | Python, scikit-learn, TensorFlow |
| **Security Engineer** | Penetration testing, audit keamanan, hardening | OWASP, pen testing tools |
| **QA Engineer** | Testing, test automation, quality assurance | Selenium, Cypress, Jest |

### 🎨 Product & Design
| Role | Tanggung Jawab Utama | Skill Kunci |
|------|---------------------|-------------|
| **Product Manager (PM)** | Roadmap, prioritas fitur, user research, spec writing | PRD, user stories, Jira/Linear |
| **UI/UX Designer** | Wireframe, prototype, design system, user testing | Figma, usability testing |
| **Product Designer** | End-to-end product design, dari research ke visual | Figma, user research |

### 📣 Marketing & Growth
| Role | Tanggung Jawab Utama | Skill Kunci |
|------|---------------------|-------------|
| **Growth Marketer** | Acquisition, funnel optimization, growth experiments | A/B testing, analytics, ads |
| **Content Writer / SEO** | Blog, landing page copy, SEO content | SEO tools, copywriting |
| **Social Media Manager** | Organic social, community, posting | Meta, TikTok, LinkedIn |
| **Performance Marketer** | Paid ads, Google Ads, Meta Ads, tracking | GA4, Meta Ads Manager |
| **Community Manager** | User community, forum, grup, engagement | Discord, Telegram, Facebook Group |

### 💼 Business & Operations
| Role | Tanggung Jawab Utama | Skill Kunci |
|------|---------------------|-------------|
| **Founder / CEO** | Strategic decisions, pricing, partnerships, investor | Semua — decision maker |
| **Sales** | Outbound, demo, closing, enterprise deals | CRM, negotiation |
| **Customer Success** | Onboarding user, retention, support | HubSpot, Zendesk, empati |
| **Finance / Legal** | Pricing model, kontrak, compliance, kebijakan | Hukum, akuntansi |
| **Operations** | Proses internal, SOP, vendor management | Project management |

### 🤖 Bisa Outsource / Freelance
| Task Type | Platform Rekomendasi |
|-----------|---------------------|
| Design sekali jadi (logo, banner) | Fiverr, 99designs, Sribulancer |
| Artikel SEO | Konten.id, Upwork |
| Penetration testing | Bug bounty platform, freelance security |
| Video editing / demo video | Upwork, Sribulancer |
| Legal dokumen (ToS, Privacy Policy) | Hukumonline, template + lawyer review |

---

## LANGKAH 4 — LOGIC ASSIGNMENT

Untuk setiap task, jalankan decision logic ini:

```
BACA deskripsi task →

IF task melibatkan UI / tampilan / CSS / komponen visual:
  → Primary: Frontend Dev

IF task melibatkan API / database / logic server / auth:
  → Primary: Backend Dev

IF task melibatkan deployment / server / CI/CD / monitoring / scaling:
  → Primary: DevOps / Infra

IF task melibatkan data pipeline / analytics infra / SQL schema / ETL:
  → Primary: Data Engineer

IF task melibatkan ML model / AI feature / prediksi / NLP:
  → Primary: Data Scientist / ML Engineer

IF task melibatkan security audit / penetration test / vulnerability:
  → Primary: Security Engineer

IF task melibatkan konten / blog / SEO / copywriting:
  → Primary: Content Writer / SEO

IF task melibatkan iklan berbayar / Google Ads / Meta Ads:
  → Primary: Performance Marketer

IF task melibatkan pricing / roadmap / feature prioritas / spec:
  → Primary: Product Manager

IF task melibatkan strategic decision / partnership / investor:
  → Primary: Founder / CEO

IF task melibatkan desain UI / wireframe / prototype / design system:
  → Primary: UI/UX Designer

IF task melibatkan komunitas / social media / engagement:
  → Primary: Community Manager / Social Media

IF task melibatkan user onboarding / support / retention:
  → Primary: Customer Success

JIKA task lintas fungsi:
  → Assign primary role + supporting roles
  → Tentukan siapa OWNER (yang bertanggung jawab output akhir)
```

### Aturan Multi-hat untuk Tim Kecil
Jika tim < 5 orang, gunakan mapping ini:

| Jika hanya ada... | Mereka juga handle... |
|-------------------|-----------------------|
| 1 Full-Stack Dev | Backend + Frontend + DevOps dasar |
| 1 Founder | PM + Sales + Ops + strategic decisions |
| 1 Marketer | Content + SEO + Social + Growth |
| Tidak ada Designer | Founder atau Dev pakai template/no-code tool |
| Tidak ada Data Engineer | Backend Dev handle query + basic analytics |

---

## LANGKAH 5 — BUAT RACI MATRIX

Untuk setiap task, tentukan:

```
R = Responsible   → yang mengerjakan task (bisa lebih dari 1)
A = Accountable   → yang bertanggung jawab atas hasil akhir (hanya 1 orang)
C = Consulted     → yang diminta input/pendapat sebelum/selama pengerjaan
I = Informed      → yang dikabari setelah task selesai
```

**Aturan RACI yang baik:**
- Setiap task harus punya tepat **1 Accountable**
- Jangan terlalu banyak Consulted — maksimal 2–3 orang
- Informed bisa banyak, tapi jangan semua orang untuk semua task
- Jika ada 2+ orang sebagai Responsible, pastikan scope masing-masing jelas

---

## LANGKAH 6 — IDENTIFIKASI DEPENDENCY

Untuk setiap task, flag:

```
BLOCKED BY: [task lain yang harus selesai dulu]
BLOCKS: [task lain yang tidak bisa mulai sebelum ini selesai]
PARALLEL OK: [task yang bisa dikerjakan bersamaan]
EXTERNAL DEPENDENCY: [vendor, tool, approval dari pihak luar yang dibutuhkan]
```

Visualisasikan dependency sebagai urutan sederhana:
```
Task A → Task B → Task D
Task C ──────────────┘
(C dan A bisa paralel, D baru bisa mulai setelah A dan C selesai)
```

---

## LANGKAH 7 — OUTPUT FORMAT

### Output 1: Tabel Assignment Lengkap

```markdown
| # | Task | Kategori | Prioritas | Owner (A) | Pengerjaan (R) | Konsultasi (C) | Info (I) | Dependency | Estimasi |
|---|------|----------|-----------|-----------|---------------|----------------|----------|------------|----------|
```

### Output 2: View Per Role/Tim

Untuk setiap role yang ada di tim:

```markdown
## 👤 [NAMA ROLE]

**Task yang dimiliki:**
| # | Task | Prioritas | Deadline | Status |
|---|------|-----------|----------|--------|

**Total task:** X
**Total estimasi effort:** X hari/minggu
**Beban kerja:** 🟢 Normal / 🟡 Padat / 🔴 Overloaded
**Bottleneck risk:** [ada/tidak — dan kenapa]
```

### Output 3: Workload Distribution Chart (teks)

```
DISTRIBUSI BEBAN KERJA
======================
Frontend Dev     ████████░░  8 task (32%)
Backend Dev      ██████████  10 task (40%)
DevOps           ███░░░░░░░  3 task (12%)
Content/SEO      ████░░░░░░  4 task (16%)
                             Total: 25 task
```

### Output 4: Gap Analysis

```markdown
## ⚠️ GAP ANALYSIS — Role yang Dibutuhkan tapi Belum Ada

| Role yang Dibutuhkan | Jumlah Task | Prioritas Task | Rekomendasi |
|---------------------|-------------|----------------|-------------|
| Security Engineer   | 3 task      | 🔴 KRITIS      | Hire freelancer untuk audit sekali, bukan full-time |
| Content Writer/SEO  | 5 task      | 🟠 TINGGI      | Outsource ke konten.id atau hire part-time |
| UI/UX Designer      | 2 task      | 🟡 MEDIUM      | Gunakan template Figma Community dulu, defer hire |
```

### Output 5: Sprint Assignment View

```markdown
## 🔴 MINGGU 1 — Assignment

| Task | Owner | Paralel dengan |
|------|-------|----------------|
| Install GA4 + Clarity | Founder | — |
| Hapus password demo dari landing page | Frontend Dev | Task di atas |
| Perbaiki meta description | Content/SEO | Semua task di minggu ini |

## 🟠 BULAN 1 — Assignment
...
```

---

## LANGKAH 8 — GENERATE EXCEL (jika diminta atau jika ada spreadsheet sebelumnya)

Jika user ingin output dalam bentuk spreadsheet, tambahkan kolom-kolom ini ke
Master Action Plan yang sudah ada:

```python
# Kolom tambahan untuk role mapping
new_columns = [
    "Owner (Accountable)",   # 1 role — bertanggung jawab atas output
    "Pengerjaan (Responsible)", # role yang mengerjakan
    "Konsultasi (Consulted)",   # role yang diminta input
    "Informasi (Informed)",     # role yang dikabari
    "Blocked By",               # nomor task yang harus selesai dulu
    "Blocks",                   # nomor task yang ter-block oleh task ini
    "Skill Dibutuhkan",         # tag skill: frontend/backend/seo/dll
    "Internal/Outsource",       # apakah bisa di-outsource
]

# Tambah sheet baru: 👥 Role Assignment
# Sheet ini berisi view per role — setiap role dapat list task-nya

# Tambah sheet baru: 🔗 Dependency Map
# Visual dependency antar task dalam format teks/tabel
```

Simpan ke `/mnt/user-data/outputs/` dan present dengan `present_files`.

---

## CONTOH ASSIGNMENT NYATA

Dari action plan Donkap yang sudah dibuat:

| Task | Owner | Pengerjaan | Konsultasi | Blocked By |
|------|-------|-----------|------------|------------|
| Hapus password demo landing page | Frontend Dev | Frontend Dev | Security Engineer | — |
| Install GA4 + Microsoft Clarity | Founder / PM | Founder / PM | — | — |
| Perbaiki meta description | Content/SEO | Content/SEO | PM | — |
| Konsolidasi domain (redirect) | DevOps | DevOps | Frontend Dev | — |
| Bangun onboarding otomatis (OTP + wizard) | Backend Dev | Backend Dev + Frontend Dev | PM, Founder | Desain wizard (UX) |
| Rekam video demo 90 detik | Founder | Founder + Video Editor | PM | Script approved |
| Setup email drip sequence | Growth Marketer | Growth Marketer | PM, CS | Onboarding otomatis live |
| Naikkan harga ke Rp79rb | Founder | Founder | PM, Sales | — |
| Bangun referral program | Backend Dev | Backend Dev + Frontend Dev | PM, Growth | Onboarding otomatis live |
| Buat 3 artikel blog SEO | Content/SEO | Content/SEO | PM | Keyword research selesai |
| Setup Uptime Robot + Sentry | DevOps | DevOps | Backend Dev | — |
| Audit keamanan OWASP ZAP | Security Engineer | Security Engineer | DevOps | — |
| Tambah fitur slip gaji digital | Backend Dev | Backend Dev + Frontend Dev | PM, Founder | Desain fitur approved |

---

## ATURAN WAJIB

1. **Setiap task wajib punya tepat 1 Accountable** — tidak boleh "Founder + PM", pilih satu.
2. **Jika role tidak ada di tim** → flagging di Gap Analysis, jangan diam-diam assign ke role yang tidak ada.
3. **Jangan over-assign satu role** — jika satu role kebanjiran task kritis, flag sebagai bottleneck.
4. **Dependency harus eksplisit** — jangan biarkan user discover sendiri bahwa task B butuh task A selesai dulu.
5. **Sesuaikan dengan ukuran tim** — di startup 2 orang, Founder bisa jadi PM + Sales + Ops. Jangan buat RACI yang tidak realistis.
6. **Selalu tanya ukuran tim jika tidak diketahui** — assignment yang salah context lebih berbahaya dari tidak ada assignment.