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
└── END_TO_END_TEST_REPORT.md # Laporan pengujian end-to-end
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
7. **Registrasi pemilih**: publik daftar via `/register` (backend validasi username unik, role `voter` otomatis).

---

## Pengujian

```bash
# Frontend
cd frontend
npm ci
npm test          # 39 test passing
npm run typecheck # tsc --noEmit
npm run build     # production build

# Backend regression (SQLite in-memory, tidak sentuh DB aplikasi)
cd ..\backend
C:/xampp/php/php.exe tests/run.php
```

---

## Keamanan & Batasan

- `.env`, token, credential, `node_modules`, `dist`, `vendor`, log, dump DB **tidak di-commit**.
- `APP_KEY` & `DB_PASSWORD` template kosong → wajib isi lokal.
- Bearer token (bukan cookie). Logout hapus token klien; token terbit tetap valid sampai expired.
- HTTPS, revocation, hardening produksi **belum dicakup**.
- Endpoint publik: kandidat, kriteria, keputusan. **Simulator akademik, bukan sistem produksi**.

---

## Lisensi & Atribusi

Lihat [ATTRIBUTION.md](ATTRIBUTION.md). Kode ini untuk keperluan akademik/simulasi.