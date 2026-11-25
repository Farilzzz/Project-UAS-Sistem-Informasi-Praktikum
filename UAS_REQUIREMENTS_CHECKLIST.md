# UAS Requirements Checklist

Status final dan jumlah tes harus dicocokkan dengan TEST_RESULTS.md pada commit yang sama. Laporan historis tidak menggantikan eksekusi terbaru.

| Persyaratan dosen | Implementasi / bukti | Verifikasi |
|---|---|---|
| Sistem informasi kelompok | React/TypeScript, PHP native, MariaDB; App dan DecisionService | Suite frontend/backend dan build; cakupan terbaru di TEST_RESULTS |
| Minimal tiga decision maker | Seed dm1/dm2/dm3 dengan role chair/member/member | Login dan role pada harness MariaDB |
| Penilaian individual | assessments per session/user/candidate/criterion; App save/finalize | Regression matriks kosong/lengkap dan MariaDB 36 nilai |
| SAW | Normalisasi benefit, bobot skala 100, skor per DM; backend/src/DecisionService.php | Target DM1 91/85/79; DM2 86/96/78; DM3 95/76/85 |
| Borda | Agregasi ranking SAW final, average points sharing | Target 8/6/4; 44.44/33.33/22.22% |
| Voting langsung | backend/src/App.php transactions, session lock, unique vote constraints | Mayoritas, voter rejection, duplicate, 1-1-1/revote, concurrency pada harness/HTTP terbaru |
| Tiga electorate resmi | OFFICIAL_ELECTORATE dan session_voters snapshot dm1/dm2/dm3 | Voter tambahan ditolak; threshold 2/3 |
| Ketua mengendalikan voting | Role chair guard backend, bukan hanya tombol frontend | Member/voter ditolak; pembukaan setelah tiga finalisasi |
| Semua DM melihat konsensus | API keputusan/election dan frontend hasil | Akses final dm1/dm2/dm3 |
| Siklus dan histori | decision_sessions, previous_session_id, final_decisions | Isolasi sesi baru dan retensi putaran pada pengujian final |
| Audit trail | audit_logs dan halaman khusus ketua | Regression role/filter/pagination; tidak membocorkan credential |
| Berita Acara A4 | FinalDecisionPage, gaya cetak | Build/typecheck, pengujian sumber sesi dan ketiadaan tanda tangan palsu; QA visual terbatas bila belum manual |
| Instalasi bersih | schema/seed tanpa USE, master session 1 final, FK composite | MariaDB fresh test nyata, bukan SQLite saja |
| Keamanan | PDO prepared statements, token bearer, role backend, validasi input | PHP syntax, regression, audit dependency dan HTTP security; batasan revocation/HTTPS dicatat |
| Publikasi dan atribusi | README, ATTRIBUTION, provenance upstream | Izin publikasi ulang dikonfirmasi pengguna; scan staged blobs sebelum push |

## Batasan yang tidak boleh disamarkan

- Tes frontend/HTTP yang lulus tidak membuktikan pemeriksaan visual seluruh viewport.
- SQLite bukan bukti instalasi MariaDB.
- npm audit tidak menjamin tidak ada kerentanan baru.
- Simulator lokal bukan sistem pemilu produksi; token bearer tetap berlaku hingga kedaluwarsa setelah logout, dan HTTPS/revocation belum disediakan.
- Registrasi dipertahankan sebagai fitur pengamat; akun tersebut bukan decision maker resmi.