# Database Setup — GDSS Pilpress

## Tujuan dan data demo

Instalasi memakai `database/schema.sql` lalu `database/seed.sql` sekali pada database kosong. Salinan di `backend/database/` harus identik. SQL tidak lagi memilih database otomatis; pemilihan database dilakukan oleh pengguna.

Data referensi: kandidat A/B/C; kriteria C1=25, C2=30, C3=25, C4=20 (total 100), semuanya benefit. Master kandidat dan kriteria terikat pada sesi 1 dan final. Tiga DM memiliki 36 nilai draft. Sesi awal berstatus assessment; ketiga DM harus login, memeriksa nilai, lalu finalisasi. Seed tidak membuka voting, memilih pemenang, atau mengesahkan keputusan.

| Akun | Role | Jabatan | Password demo |
|---|---|---|---|
| dm1 | chair | Ketua Panel | password123 |
| dm2 | member | Anggota Panel 1 | password123 |
| dm3 | member | Anggota Panel 2 | password123 |

Password ini hanya untuk simulator lokal fiktif. Ganti sebelum penggunaan non-lokal. Registrasi tambahan menghasilkan voter pengamat, bukan DM resmi.

## Instalasi baru (CLI)

1. Pastikan MariaDB aktif. Tentukan database baru, misalnya `gdss_pemilihan_presiden`.
2. Buat database kosong secara eksplisit dengan `CREATE DATABASE ... CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`.
3. Jalankan `mysql --host=127.0.0.1 --port=3306 --user=... --database=<nama> < database/schema.sql`.
4. Jalankan perintah yang sama untuk `database/seed.sql`.
5. Salin `backend/.env.example` ke `backend/.env`, isi DSN/port/database, kredensial lokal, dan APP_KEY minimal 32 karakter. Jangan gunakan port pengujian 3307 untuk aplikasi lokal yang memakai server 3306.
6. Jalankan API dan frontend sesuai README.

Contoh DSN: `mysql:host=127.0.0.1;port=3306;dbname=gdss_pemilihan_presiden;charset=utf8mb4`.

## Idempotensi dan keamanan seed

Seed transaksional bersifat fresh-only: dijalankan ulang pada data demo akan gagal pada constraint duplikat, bukan menimpa password, nilai, suara, putaran, atau keputusan. Kegagalan transaksi mengembalikan perubahan seed tersebut. Untuk demo baru gunakan database baru; jangan menghapus database utama.

## Migrasi database lama

Jangan menjalankan skrip migrasi otomatis terhadap database utama. `database/migration_session_id_not_null.sql` dan salinan backend menyediakan migrasi idempotent untuk database target yang sudah dibackup. Hentikan seluruh penulisan aplikasi sebelum migrasi. Gunakan klien SQL yang mendukung DELIMITER dan akun migrasi dengan izin CREATE ROUTINE serta ALTER. Akun runtime aplikasi tidak memerlukan izin migrasi tersebut.

Skrip menolak kepemilikan master NULL/orphan dan assessment orphan/lintas sesi sebelum DDL; tidak menebak sesi pemilik atau memperbaiki data secara diam-diam. Setelah preflight, skrip menambahkan NOT NULL, indeks unik komposit, dan foreign key yang belum tersedia. DDL MariaDB tidak transaksional: kegagalan operasional tetap dapat meninggalkan sebagian perubahan skema. Routine migrasi yang tertinggal setelah kegagalan diganti pada eksekusi ulang. Jangan memakai mysql --force.

Verifikasi ulang pada MariaDB 10.4: 33 assertion lulus, 0 gagal, mencakup sembilan database baru terisolasi, rerun, preservasi baris, dan tujuh fixture data invalid. Kompatibilitas versi MySQL lain belum diuji. Database utama tidak dimigrasi dalam pekerjaan ini.

## Pengujian terisolasi

Server uji yang digunakan: MariaDB 10.4.32 pada 127.0.0.1:3307, direktori data Hermes scratch, akun root lokal tanpa password, terpisah dari server 3306. Setiap run membuat database acak `gdss_pilpress_fresh_test_<timestamp>_<hex>`. Database uji tidak dihapus otomatis. Harness langsung memanggil App/PDO; ini bukan pengganti tes HTTP.

Perintah contoh setelah server uji tersedia:

`C:/xampp/php/php.exe backend/tests/mariadb_fresh_test.php`

Hasil dan cakupan final harus dibaca dari TEST_RESULTS.md pada snapshot yang sama, bukan dari laporan historis atau jumlah tes frontend.