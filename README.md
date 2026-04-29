# Smart UMKM Attendance — Panduan Pemakaian

Aplikasi absensi digital berbasis GPS untuk karyawan dan admin UMKM.

---

## Daftar Isi

- [Untuk Karyawan](#untuk-karyawan)
- [Untuk Admin](#untuk-admin)
- [Untuk Superadmin](#untuk-superadmin)
- [Pertanyaan Umum (FAQ)](#pertanyaan-umum-faq)

---

## Untuk Karyawan

### Daftar Akun

1. Buka aplikasi → pilih tab **Daftar**
2. Isi formulir:
   - Nama lengkap
   - Email
   - Password (minimal 6 karakter)
   - **Kode Perusahaan** — minta ke admin perusahaanmu
   - No. HP dan Jabatan (boleh dikosongkan)
3. Klik **Buat Akun**
4. Langsung bisa login dengan email dan password yang baru dibuat

---

### Masuk ke Aplikasi

1. Buka tab **Masuk**
2. Isi email dan password → klik **Masuk**

---

### Lupa Password

1. Di halaman login, klik **Lupa password?**
2. Masukkan emailmu → klik **Kirim Link Reset**
3. Buka email → klik link yang dikirim
4. Buat password baru → klik **Simpan Password Baru**
5. Login dengan password yang baru

---

### Absen Masuk

1. Buka halaman **Absensi**
2. Pastikan kamu **berada di area kantor**
3. Klik **Absen Masuk**
4. Izinkan akses lokasi jika diminta browser
5. Absen tercatat otomatis beserta jam dan jarakmu dari kantor

> **Gagal absen?** Artinya kamu belum berada dalam jangkauan GPS kantor. Dekati lokasi kantor dan coba lagi.

Status yang muncul setelah absen masuk:

| Status | Artinya |
|--------|---------|
| Hadir | Absen tepat waktu |
| Terlambat | Absen setelah jam masuk yang ditentukan |

---

### Absen Keluar

1. Di halaman **Absensi**, klik **Absen Keluar**
2. Pastikan kamu masih berada di area kantor
3. Absen keluar tercatat otomatis

> Jika keluar sebelum jam pulang, status berubah menjadi **Pulang Awal**.

---

### Riwayat Absensi

Di halaman **Absensi**, gulir ke bawah untuk melihat riwayat absensimu beserta jam masuk, jam keluar, dan status setiap hari.

---

### Mengajukan Cuti

1. Buka halaman **Cuti**
2. Klik **Ajukan Cuti**
3. Pilih jenis cuti:
   - **Tahunan** — cuti reguler
   - **Sakit** — tidak masuk karena sakit
   - **Keperluan Pribadi** — urusan di luar pekerjaan
   - **Lainnya** — alasan lain
4. Pilih tanggal mulai dan tanggal selesai
5. Tulis alasan → klik **Ajukan**

Pengajuan akan masuk ke admin untuk disetujui. Status bisa dipantau di halaman Cuti:

| Status | Artinya |
|--------|---------|
| Menunggu | Belum diproses admin |
| Disetujui | Cuti disetujui |
| Ditolak | Cuti ditolak (lihat catatan admin) |

---

### Mengajukan Lembur

1. Buka halaman **Lembur**
2. Klik **Ajukan Lembur**
3. Pilih tanggal lembur
4. Masukkan jam mulai dan jam selesai
5. Tulis alasan → klik **Ajukan**

Durasi lembur dihitung otomatis. Proses persetujuan sama seperti cuti.

---

### Edit Profil

1. Buka halaman **Profil**
2. Klik **Edit Profil**
3. Ubah nama, nomor HP, atau jabatan
4. Klik **Simpan**

---

### Install Aplikasi di HP (Opsional)

Aplikasi bisa dipasang di layar utama HP seperti aplikasi biasa:

- **Android (Chrome):** Ketuk menu `⋮` → **Add to Home Screen**
- **iPhone (Safari):** Ketuk tombol Share → **Add to Home Screen**

---

## Untuk Admin

Admin mendapat menu tambahan **Admin Panel** di navigasi.

---

### Melihat Ringkasan Harian

Begitu masuk ke Admin Panel, langsung terlihat:
- Jumlah karyawan aktif
- Berapa orang yang sudah hadir hari ini
- Jumlah pengajuan cuti yang menunggu
- Jumlah pengajuan lembur yang menunggu

---

### Memantau Absensi Karyawan

1. Buka tab **Absensi** di Admin Panel
2. Semua absensi karyawan tampil dengan jam masuk, jam keluar, jarak dari kantor, dan status
3. Gunakan filter tanggal untuk melihat hari tertentu

**Export ke Excel:**
1. Klik **Export CSV**
2. Pilih rentang tanggal (default: bulan ini)
3. File langsung terunduh, bisa dibuka di Excel

---

### Menyetujui atau Menolak Cuti

1. Buka tab **Cuti** di Admin Panel
2. Gunakan filter untuk melihat pengajuan yang **Menunggu**
3. Klik **Setujui** atau **Tolak** pada pengajuan yang masuk
4. Jika menolak, wajib isi catatan alasan penolakan
5. Karyawan akan melihat status dan catatanmu

> Kamu tidak bisa menyetujui cuti milikmu sendiri.

---

### Menyetujui atau Menolak Lembur

Sama seperti alur cuti di atas, melalui tab **Lembur**.

---

### Mengelola Karyawan

Buka tab **Karyawan** di Admin Panel:

- **Ubah Role:** Jadikan karyawan biasa menjadi admin, atau sebaliknya
- **Nonaktifkan:** Karyawan yang nonaktif tidak bisa login. Klik lagi untuk mengaktifkan kembali

---

### Mengatur Pengaturan Perusahaan

Buka tab **Pengaturan** di Admin Panel:

| Pengaturan | Keterangan |
|-----------|-----------|
| Nama Perusahaan | Nama yang tampil di aplikasi |
| Kode Perusahaan | Kode unik yang dibagikan ke karyawan saat daftar |
| Lokasi Kantor | Cari alamat atau klik tombol GPS untuk ambil lokasi saat ini |
| Radius Absen | Jarak maksimal (dalam meter) agar absen diterima |
| Jam Masuk | Batas waktu absen tepat waktu |
| Jam Pulang | Batas waktu pulang normal |

Klik **Simpan Pengaturan** setelah selesai.

---

### Membuat Akun Admin Pertama

Setelah daftar biasa, admin perusahaan perlu mengubah role akun kamu menjadi `admin` melalui Supabase Dashboard (SQL Editor):

```sql
UPDATE profiles SET role = 'admin' WHERE email = 'emailmu@contoh.com';
```

---

## Untuk Superadmin

Superadmin punya akses ke menu **Superadmin** (ikon perisai di navigasi).

---

### Melihat Ringkasan Semua Perusahaan

Halaman Superadmin langsung menampilkan:
- Total perusahaan yang terdaftar
- Total karyawan dari semua perusahaan

---

### Daftar Perusahaan

Semua perusahaan tampil dalam tabel beserta:
- Nama dan kode unik perusahaan
- Alamat kantor
- Jumlah karyawan (klik angkanya untuk lihat daftar karyawan)

---

### Menambah Perusahaan Baru

1. Klik **Tambah Perusahaan**
2. Isi formulir:
   - Nama perusahaan
   - Kode unik (contoh: `TOKO2025`) — ini yang dibagikan ke karyawan saat daftar
   - Radius absen dan jam kerja
   - Lokasi kantor — cari alamat atau klik GPS
3. Klik **Buat Perusahaan**

---

### Mengelola Karyawan per Perusahaan

1. Klik angka jumlah karyawan pada baris perusahaan
2. Lihat semua karyawan perusahaan tersebut
3. Ubah role karyawan langsung dari dropdown:
   - `employee` — karyawan biasa
   - `admin` — admin perusahaan
   - `superadmin` — akses penuh lintas perusahaan

---

### Membuat Akun Superadmin

Ubah role via Supabase Dashboard (SQL Editor):

```sql
UPDATE profiles SET role = 'superadmin' WHERE email = 'emailmu@contoh.com';
```

---

## Pertanyaan Umum (FAQ)

### Absensi

**Kenapa tombol Absen Masuk tidak bisa diklik?**
Berarti kamu sudah absen masuk hari ini. Satu kali absen masuk per hari.

**Muncul pesan "You are Xm away from the office"?**
Kamu belum berada dalam radius absen yang ditentukan admin. Pindah lebih dekat ke kantor dan coba lagi. Jika kamu sudah di kantor tapi tetap gagal, minta admin untuk memperbesar radius absen di pengaturan perusahaan.

**Browser meminta izin lokasi, apa yang harus dilakukan?**
Klik **Izinkan** / **Allow**. Aplikasi butuh GPS untuk memverifikasi kamu sedang di kantor. Tanpa izin lokasi, absen tidak bisa diproses.

**Sudah klik Izinkan tapi GPS tidak muncul?**
Coba langkah berikut:
1. Refresh halaman dan coba lagi
2. Pastikan sinyal GPS aktif (bukan hanya WiFi)
3. Di pengaturan browser, pastikan izin lokasi untuk aplikasi ini diatur ke **Izinkan**
4. Coba buka aplikasi di tab baru

**Lupa absen keluar, apa yang terjadi?**
Data absensi hari itu tetap tercatat dengan status sesuai jam masuk (Hadir atau Terlambat). Jam keluar akan kosong. Hubungi admin jika perlu koreksi data.

**Aplikasi bilang "Kamu sedang offline"?**
Koneksi internetmu terputus. Absen membutuhkan koneksi aktif karena perlu memverifikasi lokasi ke server. Sambungkan ke WiFi atau data seluler dan coba lagi.

---

### Cuti & Lembur

**Pengajuan cuti saya ditolak, bisa diajukan ulang?**
Bisa. Klik **Ajukan Cuti** kembali dengan tanggal dan alasan yang baru. Pengajuan yang sudah ditolak tidak bisa diedit, harus mengajukan yang baru.

**Kenapa tombol Ajukan tidak aktif (abu-abu)?**
Pastikan semua kolom sudah diisi: jenis cuti, tanggal mulai, tanggal selesai, dan alasan. Tombol baru aktif setelah semua terisi.

**Tanggal cuti yang dipilih bentrok dengan pengajuan sebelumnya?**
Muncul pesan error jika tanggal yang dipilih sudah ada pengajuan cuti lain yang sedang menunggu atau sudah disetujui pada periode yang sama.

**Berapa lama admin memproses pengajuan?**
Tergantung kebijakan perusahaan. Kamu bisa pantau statusnya langsung di halaman Cuti atau Lembur.

---

### Akun & Login

**Email sudah terdaftar tapi tidak bisa login?**
- Pastikan tidak ada spasi di depan/belakang email
- Coba fitur **Lupa password?** untuk reset password
- Hubungi admin jika masalah berlanjut — mungkin akun dinonaktifkan

**Link reset password tidak berfungsi?**
Link hanya berlaku selama 1 jam. Jika sudah lewat, ulangi proses lupa password dari awal.

**Kode perusahaan tidak diterima saat daftar?**
Pastikan kode diketik dengan benar — kode bersifat huruf kapital semua, contoh: `TOKO2025`. Minta kode yang benar ke admin perusahaanmu.

---

### Aplikasi & Tampilan

**Jam absen yang muncul salah?**
Aplikasi menggunakan zona waktu WIB (UTC+7). Jika jam tampil berbeda, coba refresh halaman.

**Aplikasi lambat atau data tidak muncul?**
Coba refresh halaman. Jika masih lambat, periksa koneksi internet.

**Bisa dipakai di HP tanpa install?**
Bisa. Cukup buka URL aplikasi di browser HP. Tapi untuk pengalaman terbaik, install sebagai aplikasi lewat **Add to Home Screen** agar bisa diakses lebih cepat dan tampil layar penuh.

**Data absensi bulan lalu masih ada?**
Ya, semua riwayat tersimpan. Gulir ke halaman berikutnya di tab Riwayat Absensi untuk melihat data lebih lama.
