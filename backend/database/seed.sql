-- Seed Data GDSS Pemilihan Calon Presiden
-- Default development password untuk dm1, dm2, dm3: password123
-- Hash bcrypt: $2y$10$v7wBWbGxRhqJBxjTRThVueu/BSLz9hSZHGGZG/kohyZJDPPZ.ynoy

USE `gdss_pemilihan_presiden`;

-- 1. Insert Users (3 Decision Makers)
INSERT INTO `users` (`id`, `username`, `name`, `role`, `password_hash`) VALUES
(1, 'dm1', 'Ketua Panel', 'chair', '$2y$10$v7wBWbGxRhqJBxjTRThVueu/BSLz9hSZHGGZG/kohyZJDPPZ.ynoy'),
(2, 'dm2', 'Anggota Panel 1', 'member', '$2y$10$v7wBWbGxRhqJBxjTRThVueu/BSLz9hSZHGGZG/kohyZJDPPZ.ynoy'),
(3, 'dm3', 'Anggota Panel 2', 'member', '$2y$10$v7wBWbGxRhqJBxjTRThVueu/BSLz9hSZHGGZG/kohyZJDPPZ.ynoy')
ON DUPLICATE KEY UPDATE `name`=VALUES(`name`), `role`=VALUES(`role`), `password_hash`=VALUES(`password_hash`);

-- 2. Insert Candidates (3 Kandidat Presiden Fiktif)
INSERT INTO `candidates` (`id`, `name`, `vision`, `mission`, `profile`) VALUES
(1, 'Kandidat A', 'Indonesia Maju, Berdaulat, dan Berkeadilan Sosial', 'Akselerasi pembangunan SDM unggul, penguatan ekonomi kerakyatan berkelanjutan, dan penegakan supremasi hukum yang berkeadilan.', 'Kandidat fiktif A untuk simulasi akademik GDSS Pemilihan Calon Presiden.'),
(2, 'Kandidat B', 'Transformasi Digital dan Ketahanan Nasional Tangguh', 'Percepatan modernisasi birokrasi berbasis teknologi informasi, swasembada pangan energi, dan stabilitas geopolitik regional.', 'Kandidat fiktif B untuk simulasi akademik GDSS Pemilihan Calon Presiden.'),
(3, 'Kandidat C', 'Pemerataan Kesejahteraan dan Demokrasi Partisipatif', 'Pemberdayaan masyarakat daerah 3T, reformasi perpajakan yang progresif, serta komitmen transisi energi hijau ramah lingkungan.', 'Kandidat fiktif C untuk simulasi akademik GDSS Pemilihan Calon Presiden.')
ON DUPLICATE KEY UPDATE `name`=VALUES(`name`), `vision`=VALUES(`vision`), `mission`=VALUES(`mission`), `profile`=VALUES(`profile`);

-- 3. Insert Criteria (4 Kriteria Benefit Bobot 25, 30, 25, 20)
INSERT INTO `criteria` (`id`, `code`, `name`, `weight`, `type`) VALUES
(1, 'C1', 'Pengalaman kepemimpinan', 25, 'benefit'),
(2, 'C2', 'Kejelasan program kerja', 30, 'benefit'),
(3, 'C3', 'Rekam jejak kegiatan', 25, 'benefit'),
(4, 'C4', 'Kemampuan komunikasi', 20, 'benefit')
ON DUPLICATE KEY UPDATE `code`=VALUES(`code`), `name`=VALUES(`name`), `weight`=VALUES(`weight`), `type`=VALUES(`type`);

-- 4. Insert Default Sesi Keputusan
INSERT INTO `decision_sessions` (`id`, `title`, `description`, `status`, `current_round`) VALUES
(1, 'Simulasi GDSS Pemilihan Calon Presiden 2026', 'Sesi pengambilan keputusan kelompok pemilihan calon presiden menggunakan metode SAW, Borda, dan Konsensus Voting.', 'assessment', 0)
ON DUPLICATE KEY UPDATE `title`=VALUES(`title`), `description`=VALUES(`description`);

-- 5. Insert Matriks Penilaian Awal (Sesuai Data Excel Sumber)
-- Skala Nilai: 1 - 5
-- DM1 (Ketua Panel): A(5,5,4,4), B(4,4,5,4), C(3,4,4,5) -> SAW: A=91, B=85, C=79
-- DM2 (Anggota 1):  A(4,5,4,4), B(5,5,5,4), C(4,3,4,5) -> SAW: A=86, B=96, C=78
-- DM3 (Anggota 2):  A(5,5,4,5), B(4,4,4,3), C(4,4,5,4) -> SAW: A=95, B=76, C=85
INSERT INTO `assessments` (`session_id`, `user_id`, `candidate_id`, `criterion_id`, `score`) VALUES
-- DM1 (Ketua Panel)
(1, 1, 1, 1, 5), (1, 1, 1, 2, 5), (1, 1, 1, 3, 4), (1, 1, 1, 4, 4),
(1, 1, 2, 1, 4), (1, 1, 2, 2, 4), (1, 1, 2, 3, 5), (1, 1, 2, 4, 4),
(1, 1, 3, 1, 3), (1, 1, 3, 2, 4), (1, 1, 3, 3, 4), (1, 1, 3, 4, 5),
-- DM2 (Anggota Panel 1)
(1, 2, 1, 1, 4), (1, 2, 1, 2, 5), (1, 2, 1, 3, 4), (1, 2, 1, 4, 4),
(1, 2, 2, 1, 5), (1, 2, 2, 2, 5), (1, 2, 2, 3, 5), (1, 2, 2, 4, 4),
(1, 2, 3, 1, 4), (1, 2, 3, 2, 3), (1, 2, 3, 3, 4), (1, 2, 3, 4, 5),
-- DM3 (Anggota Panel 2)
(1, 3, 1, 1, 5), (1, 3, 1, 2, 5), (1, 3, 1, 3, 4), (1, 3, 1, 4, 5),
(1, 3, 2, 1, 4), (1, 3, 2, 2, 4), (1, 3, 2, 3, 4), (1, 3, 2, 4, 3),
(1, 3, 3, 1, 4), (1, 3, 3, 2, 4), (1, 3, 3, 3, 5), (1, 3, 3, 4, 4)
ON DUPLICATE KEY UPDATE `score`=VALUES(`score`);

-- 6. Insert Status Penilaian Awal (Draft / Belum Difinalisasi agar dapat diuji via API)
INSERT INTO `assessment_status` (`session_id`, `user_id`, `is_finalized`, `finalized_at`) VALUES
(1, 1, 0, NULL),
(1, 2, 0, NULL),
(1, 3, 0, NULL)
ON DUPLICATE KEY UPDATE `is_finalized`=VALUES(`is_finalized`), `finalized_at`=VALUES(`finalized_at`);
