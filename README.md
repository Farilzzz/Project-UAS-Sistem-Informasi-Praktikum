# Sistem Informasi Pilpress — GDSS Pemilihan Calon Presiden

Simulasi akademik pengambilan keputusan kelompok (GDSS) menggunakan **React + TypeScript (Vite)**, **PHP 8 Native**, **MySQL/MariaDB**: **SAW + Borda + Voting Langsung + Pengesahan Ketua + Registrasi Pemilih**.
Kandidat dan akun seed adalah fiktif, bukan data pemilu atau pengguna nyata.

---

## Struktur Proyek

```
.
├── backend/
│   ├── public/              # Document root API (index.php, .htaccess)
│   ├── src/                 # Otorisasi, transaksi, SAW/Borda, workflow voting
│   ├── database/            # Schema & seed (salinan identik dari root database/)
│   ├── tests/               # Regression SQLite & HTTP terisolasi
│   ├── tools/               # Provision akun
│   └── .env.example         # Template konfigurasi DB & APP_KEY
├── frontend/
│   ├── src/                 # React + TypeScript + Tailwind + Vitest
│   ├── .env.example         # Template Vite proxy
│   └── package.json
├── database/
│   ├── schema.sql           # Sumber utama SQL instalasi baru
│   └── seed.sql             # Seed data demo (DM + voter)
├── docs/
│   └── INTEGRATION.md       # Dokumentasi integrasi frontend-backend
├── ATTRIBUTION.md           # Atribusi library & aset
├── SECURITY_REVIEW.md       # Tinjauan keamanan
├── END_TO_END_TEST_REPORT.md # Laporan pengujian end-to-end
├── PHASE_6_AUDIT_REPORT.md  # Temuan & kriteria penerimaan Phase 6
└── PHASE_6_IMPLEMENTATION_REPORT.md # Hasil implementasi Phase 6
```

---

## Prasyarat

- **Windows + XAMPP** (PHP 8.1+, MariaDB 10.4+), ekstensi `pdo_mysql`
- **PDO SQLite** hanya untuk regression backend
- **Node.js 22 LTS** (22.12+) atau **24 LTS**, npm ≥ 10
- Tidak memerlukan Composer

---

## Instalasi Lokal (XAMPP + Vite)

```bash
# 1. Clone repo
git clone https://github.com/rohmad656/Sistem-Informasi-PILPRESS-.git
cd Sistem-Informasi-PILPRESS-

# 2. Jalankan MySQL dari XAMPP Control Panel

# 3. Instalasi database baru (hanya sekali)
#    Import via phpMyAdmin atau CLI:
#    mysql -u root < database/schema.sql
#    mysql -u root < database/seed.sql
#    (Nama database: gdss_pemilihan_presiden)

# 4. Konfigurasi backend
cp backend/.env.example backend/.env
# Isi DB_USER, DB_PASSWORD, APP_KEY (min 32 char)
# APP_KEY generate: C:/xampp/php/php.exe -r "echo bin2hex(random_bytes(32)), PHP_EOL;"

# 5. Terminal 1 — Backend API
C:/xampp/php/php.exe -S 127.0.0.1:8080 -t backend/public backend/public/index.php

# 6. Terminal 2 — Frontend Vite
cd frontend
npm ci
npm run dev -- --host 127.0.0.1 --strictPort
```

Buka `http://127.0.0.1:5173` (Vite proxy `/api` → `127.0.0.1:8080`).
Probe API: `http://127.0.0.1:5173/api/candidates`.

---

## Akun Demo & Role

| Username | Role    | Password   | Keterangan            |
|----------|---------|------------|-----------------------|
| `dm1`    | `chair` | `password123` | Ketua Panel           |
| `dm2`    | `member`| `password123` | Anggota Panel 1       |
| `dm3`    | `member`| `password123` | Anggota Panel 2       |
| `voter1` | `voter` | `password123` | Pemilih (bisa daftar) |

**Workflow:**
1. **DM (chair/member)** login → isi penilaian 12 item (3 kandidat × 4 kriteria, skala 1–5) → **Finalisasi** masing-masing.
2. Lihat hasil **SAW individual** & **Borda agregasi** (dihitung backend, frontend hanya tampil).
3. **Ketua (chair)** buka sesi **Voting** setelah 3 DM final.
4. Semua **DM + Voter** terdaftar memilih **1 suara per putaran**.
5. Mayoritas **> 50%** → pemenang. **Seri** → Ketua buka **Revote**.
6. Ketua **mengesahkan** hasil mayoritas → **Keputusan Final**.
7. Ketua dapat membuka **Log Aktivitas** (`/audit-logs`, khusus `chair`) dan mencetak **Berita Acara Keputusan Resmi** dari halaman Keputusan Final.
8. **Registrasi pemilih**: publik daftar via `/register` (backend validasi username unik, role `voter` otomatis).

---

## Fitur Phase 6

### 1. Audit Trail (Log Aktivitas)

- Halaman **Log Aktivitas** (`/audit-logs`) menampilkan jejak aktivitas sistem untuk sesi pemilihan aktif.
- Akses **khusus Ketua Panel** (`chair`). Anggota panel (`member`), pemilih (`voter`), dan pengguna tanpa token ditolak — baik lewat menu maupun URL langsung.
- Filter tersedia: **ID AKTOR**, **AKSI**, **DARI TANGGAL**, **SAMPAI TANGGAL**. Pagination `Berikutnya`/`Sebelumnya` untuk navigasi hasil.
- Informasi per entri: **Waktu, Aktor, Peran, Aksi, Detail, IP**. Password, token, dan kredensial tidak ditampilkan.

### 2. Berita Acara Keputusan

- Buka halaman **Keputusan Final** dari Dashboard setelah Ketua Panel mengesahkan hasil voting.
- Klik tombol **Cetak Berita Acara** → browser membuka dialog cetak.
- Simpan sebagai PDF: pada dialog cetak pilih **Save as PDF** (Chrome/Edge) atau **Print to File**.
- Dokumen memakai **format A4** (margin 16 mm). Sidebar, navbar, dan tombol otomatis tersembunyi saat cetak.
- Tiga slot tanda tangan disediakan: **DM1 (Ketua Panel)**, **DM2 (Anggota Panel 1)**, **DM3 (Anggota Panel 2)**. Nama diambil dari data panelis sesi; jika belum tersedia, ditampilkan placeholder `Nama panelis — diisi resmi`.

### 3. Dashboard Active Election

- Banner **Siklus Pemilihan Aktif** menampilkan nama siklus, deskripsi, **ID Sesi**, **Status**, dan **Putaran** saat ini.
- Status dan tahapan (penilaian → SAW/Borda → voting → keputusan) terbaca dari resolver sesi aktif backend, konsisten untuk semua peran.
- Jika belum ada siklus aktif, ditampilkan empty state.

### 4. Assessment (Penilaian)

- Penilaian dapat dilakukan hanya bila **kriteria dan kandidat telah final** untuk sesi aktif.
- Jika kriteria/kandidat belum tersedia atau belum difinalisasi, halaman menampilkan empty state yang mengarahkan ke **Ketua Panel**.
- Anggota panel tidak melihat kontrol konfigurasi kriteria/kandidat.

---

## Pengujian

```bash
# Frontend
cd frontend
npm ci
npm test              # 97 test passing
npx tsc --noEmit      # TypeScript check
npm run build         # production build

# Backend regression (SQLite in-memory, tidak sentuh DB aplikasi)
cd ..\backend
C:/xampp/php/php.exe tests/run.php   # 66 test passing
```

Hasil final: backend **66/66 PASS**, frontend **97/97 PASS**, TypeScript **PASS**, production build **PASS**, PHP syntax **PASS**.

---

## Project Status

| Phase | Ringkasan | Status |
|---|---|---|
| 1 | Fondasi auth, role, kandidat, kriteria | Selesai |
| 2 | Penilaian SAW individual & Borda agregasi | Selesai |
| 3 | Voting langsung, revote, pengesahan ketua | Selesai |
| 4 | Siklus pemilihan & histori keputusan | Selesai |
| 5 | Data master per sesi (kriteria & kandidat final) | Selesai |
| 6 | Audit Trail, Berita Acara, konteks siklus aktif, empty state penilaian, QA responsif & cetak | **READY WITH LIMITATIONS** |

**Keterbatasan QA visual:** Playwright tidak tersedia; QA dilakukan dengan **Chrome headless + Chrome DevTools Protocol (CDP)**. Screenshot dan PDF A4 dihasilkan, tetapi **belum diperiksa secara visual manual oleh manusia**. Pemeriksaan memakai DOM terukur (lebar tabel, overflow, computed style, teks, jumlah heading) dan emulasi media cetak. Review manual artefak disarankan sebelum rilis produksi.

Detail lengkap: [`PHASE_6_IMPLEMENTATION_REPORT.md`](PHASE_6_IMPLEMENTATION_REPORT.md).

---

## Keamanan & Batasan

- `.env`, token, credential, `node_modules`, `dist`, `vendor`, log, dump DB **tidak di-commit**.
- `APP_KEY` & `DB_PASSWORD` template kosong → wajib isi lokal.
- Bearer token (bukan cookie). Logout hapus token klien; token terbit tetap valid sampai expired.
- `GET /api/audit-logs` hanya untuk `chair`; `member`/`voter` ditolak 403, tanpa token ditolak 401.
- HTTPS, revocation, hardening produksi **belum dicakup**.
- Endpoint publik: kandidat, kriteria, keputusan. **Simulator akademik, bukan sistem produksi**.

---

## Lisensi & Atribusi

Lihat [ATTRIBUTION.md](ATTRIBUTION.md). Kode ini untuk keperluan akademik/simulasi.