# Hasil pengujian revisi

Snapshot lokal 25 November 2026. Belum merupakan pengesahan publikasi; review keamanan akhir masih berjalan.

## Eksekusi ulang oleh integrator

| Pemeriksaan | Hasil |
|---|---|
| PHP backend/tests/run.php | 73 lulus, 0 gagal; SQLite terisolasi |
| PHP backend/tests/mariadb_fresh_test.php | 75 lulus, 0 gagal; MariaDB 10.4.32, port 3307 |
| Migrasi (verify_session_migration.py, artefak lokal scratch) | 33 assertion lulus, 0 gagal; 9 DB baru |
| npm ci | Berhasil; 283 paket diaudit |
| npm test (default concurrency) | 102 lulus, 1 timeout 5000ms pada RegisterPage; bukan hasil hijau |
| npm test -- --maxWorkers=2 | 103 lulus, 0 gagal; 19 berkas |
| npx tsc --noEmit | Exit 0 |
| npm run build | Exit 0; 2561 modules |
| npm audit | 0 vulnerability yang dilaporkan registry |
| npm audit --omit=dev | 0 vulnerability yang dilaporkan registry |

Jangan menjumlahkan semua kategori sebagai jumlah skenario unik: assertion dan suite memiliki cakupan beririsan. Run default frontend masih memiliki risiko timeout saat contention; run dua worker berhasil tanpa menaikkan batas waktu test. npm memberi peringatan deprecation Recharts 2 dan whatwg-encoding serta esbuild install-script approval; build tetap berhasil.

## MariaDB dan HTTP

Database verifikasi ulang: `gdss_pilpress_fresh_test_20261125_011902_be466640`, baru dan dipertahankan. Server utama port 3306 tidak dipakai. Schema dan seed yang dikirim di repository diimpor, bukan fixture SQLite.

Cakupan: login tiga DM, master sesi final, 36 nilai draft, simpan/finalisasi setiap DM, SAW 91/85/79;86/96/78;95/76/85, Borda 8/6/4, voter ditolak, suara ganda ditolak, mayoritas 2–1, keputusan terlihat semua DM, seed replay tidak mengubah baris, siklus baru kosong dan isolasi master melalui FK komposit.

Siklus kedua benar-benar menghasilkan 1–1–1, penolakan ratifikasi seri, revote round 2, electorate tetap dan seluruh ballot/history dipertahankan. Race dua proses PHP/PDO menghasilkan tepat satu sukses dan satu 409 untuk duplicate vote maupun ratifikasi; satu keputusan dan satu audit ratifikasi tersimpan. Ini bukan bukti stress test skala produksi.

HTTP server sementara pada loopback ditutup setelah suite: login, bearer, token hilang/palsu/kedaluwarsa, member mutation, SQL injection login/session ID, dan CORS allowed/disallowed diuji.

## Batas cakupan

Browser authenticated E2E, pemeriksaan visual desktop/tablet/mobile, dan hasil cetak A4 fisik belum diverifikasi. Tes komponen bukan pengganti browser. Migrasi diuji pada MariaDB 10.4, bukan seluruh versi MySQL. HTTPS, token revocation setelah logout, rate limiting produksi dan deployment internet tidak diuji/disediakan. Audit dependency nol bukan jaminan bebas kerentanan. Pemeriksaan keamanan source/riwayat dan publikasi masih menunggu gate akhir.
