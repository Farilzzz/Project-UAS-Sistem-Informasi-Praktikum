-- Schema Database GDSS Pemilihan Calon Presiden
-- Engine: MySQL 8.0+ / MariaDB 10.4+
-- Database: gdss_pemilihan_presiden

CREATE DATABASE IF NOT EXISTS `gdss_pemilihan_presiden` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE `gdss_pemilihan_presiden`;

-- 1. Tabel Pengguna (Decision Makers + Voters)
CREATE TABLE IF NOT EXISTS `users` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `username` VARCHAR(50) NOT NULL UNIQUE,
    `name` VARCHAR(100) NOT NULL,
    `role` ENUM('chair', 'member', 'voter') NOT NULL DEFAULT 'voter',
    `password_hash` VARCHAR(255) NOT NULL,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. Tabel Kandidat Presiden (Alternatif)
CREATE TABLE IF NOT EXISTS `candidates` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    -- Phase 5: data master terisolasi per sesi
    `session_id` INT NULL,
    `name` VARCHAR(100) NOT NULL,
    `description` TEXT NULL,
    `vision` TEXT NULL,
    `mission` TEXT NULL,
    `work_program` TEXT NULL,
    `profile` TEXT NULL,
    `is_finalized` TINYINT(1) NOT NULL DEFAULT 0,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP NULL DEFAULT NULL,
    KEY `idx_candidates_session` (`session_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. Tabel Kriteria Penilaian
CREATE TABLE IF NOT EXISTS `criteria` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    -- Phase 5: data master terisolasi per sesi
    `session_id` INT NULL,
    `code` VARCHAR(10) NOT NULL UNIQUE,
    `name` VARCHAR(120) NOT NULL,
    `description` TEXT NULL,
    `weight` INT NOT NULL CHECK (`weight` > 0),
    `type` ENUM('benefit', 'cost') NOT NULL DEFAULT 'benefit',
    `is_finalized` TINYINT(1) NOT NULL DEFAULT 0,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP NULL DEFAULT NULL,
    KEY `idx_criteria_session` (`session_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. Tabel Sesi Keputusan (Decision Sessions)
CREATE TABLE IF NOT EXISTS `decision_sessions` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `title` VARCHAR(150) NOT NULL,
    `description` TEXT NULL,
    `status` ENUM('assessment', 'voting', 'tie_revote', 'voting_completed', 'ratified') NOT NULL DEFAULT 'assessment',
    `current_round` INT NOT NULL DEFAULT 0,
    -- Phase 4: jejak siklus pemilihan (nullable -> session lama tetap valid)
    `created_by` INT NULL,
    `previous_session_id` INT NULL,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT `fk_ds_created_by` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL,
    CONSTRAINT `fk_ds_previous_session` FOREIGN KEY (`previous_session_id`) REFERENCES `decision_sessions` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 5. Tabel Penilaian Individual (Assessments Matrix)
CREATE TABLE IF NOT EXISTS `assessments` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `session_id` INT NOT NULL DEFAULT 1,
    `user_id` INT NOT NULL,
    `candidate_id` INT NOT NULL,
    `criterion_id` INT NOT NULL,
    `score` INT NOT NULL CHECK (`score` BETWEEN 1 AND 5),
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY `uq_assessment_item` (`session_id`, `user_id`, `candidate_id`, `criterion_id`),
    CONSTRAINT `fk_assessments_session` FOREIGN KEY (`session_id`) REFERENCES `decision_sessions` (`id`) ON DELETE CASCADE,
    CONSTRAINT `fk_assessments_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
    CONSTRAINT `fk_assessments_candidate` FOREIGN KEY (`candidate_id`) REFERENCES `candidates` (`id`) ON DELETE CASCADE,
    CONSTRAINT `fk_assessments_criterion` FOREIGN KEY (`criterion_id`) REFERENCES `criteria` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 6. Tabel Status Finalisasi Penilaian (Assessment Status per DM)
CREATE TABLE IF NOT EXISTS `assessment_status` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `session_id` INT NOT NULL DEFAULT 1,
    `user_id` INT NOT NULL,
    `is_finalized` TINYINT(1) NOT NULL DEFAULT 0,
    `finalized_at` TIMESTAMP NULL DEFAULT NULL,
    UNIQUE KEY `uq_session_user_status` (`session_id`, `user_id`),
    CONSTRAINT `fk_astatus_session` FOREIGN KEY (`session_id`) REFERENCES `decision_sessions` (`id`) ON DELETE CASCADE,
    CONSTRAINT `fk_astatus_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 7. Tabel Putaran Voting (Voting Rounds)
CREATE TABLE IF NOT EXISTS `voting_rounds` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `session_id` INT NOT NULL DEFAULT 1,
    `round_number` INT NOT NULL,
    `status` ENUM('open', 'completed', 'tie_revote') NOT NULL DEFAULT 'open',
    `opened_by` INT NOT NULL,
    `opened_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    `closed_at` TIMESTAMP NULL DEFAULT NULL,
    UNIQUE KEY `uq_session_round` (`session_id`, `round_number`),
    CONSTRAINT `fk_vrounds_session` FOREIGN KEY (`session_id`) REFERENCES `decision_sessions` (`id`) ON DELETE CASCADE,
    CONSTRAINT `fk_vrounds_user` FOREIGN KEY (`opened_by`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 8. Tabel Suara Voting (Votes)
CREATE TABLE IF NOT EXISTS `votes` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `session_id` INT NOT NULL DEFAULT 1,
    `round_id` INT NOT NULL,
    `user_id` INT NOT NULL,
    `candidate_id` INT NOT NULL,
    `voted_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY `uq_round_user` (`round_id`, `user_id`),
    CONSTRAINT `fk_votes_session` FOREIGN KEY (`session_id`) REFERENCES `decision_sessions` (`id`) ON DELETE CASCADE,
    CONSTRAINT `fk_votes_round` FOREIGN KEY (`round_id`) REFERENCES `voting_rounds` (`id`) ON DELETE CASCADE,
    CONSTRAINT `fk_votes_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`),
    CONSTRAINT `fk_votes_candidate` FOREIGN KEY (`candidate_id`) REFERENCES `candidates` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 9. Tabel Keputusan Konsensus Final (Final Decisions)
CREATE TABLE IF NOT EXISTS `final_decisions` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `session_id` INT NOT NULL DEFAULT 1,
    `round_id` INT NOT NULL,
    `candidate_id` INT NOT NULL,
    `approved_by` INT NOT NULL,
    `reason` TEXT NOT NULL,
    `total_votes` INT NOT NULL,
    `percentage` DECIMAL(5,2) NOT NULL,
    `approved_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY `uq_session_decision` (`session_id`),
    CONSTRAINT `fk_fdecision_session` FOREIGN KEY (`session_id`) REFERENCES `decision_sessions` (`id`) ON DELETE CASCADE,
    CONSTRAINT `fk_fdecision_round` FOREIGN KEY (`round_id`) REFERENCES `voting_rounds` (`id`),
    CONSTRAINT `fk_fdecision_candidate` FOREIGN KEY (`candidate_id`) REFERENCES `candidates` (`id`),
    CONSTRAINT `fk_fdecision_user` FOREIGN KEY (`approved_by`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 10. Tabel Snapshot Pemilih (Session Voters)
CREATE TABLE IF NOT EXISTS `session_voters` (
    `session_id` INT NOT NULL,
    `user_id` INT NOT NULL,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`session_id`, `user_id`),
    CONSTRAINT `fk_sv_session` FOREIGN KEY (`session_id`) REFERENCES `decision_sessions` (`id`) ON DELETE CASCADE,
    CONSTRAINT `fk_sv_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 11. Tabel Rate Limiting Login
CREATE TABLE IF NOT EXISTS `login_attempts` (
    `bucket` CHAR(64) PRIMARY KEY,
    `attempts` INT NOT NULL DEFAULT 1,
    `started_at` BIGINT NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 12. Tabel Audit Trail (Audit Logs)
CREATE TABLE IF NOT EXISTS `audit_logs` (
    `id` BIGINT AUTO_INCREMENT PRIMARY KEY,
    `session_id` INT NULL,
    `user_id` INT NULL,
    `action` VARCHAR(60) NOT NULL,
    `details` TEXT NOT NULL,
    `ip_address` VARCHAR(45) NULL,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX `idx_audit_session` (`session_id`),
    CONSTRAINT `fk_audit_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Phase 5: foreign key data master per sesi (didefinisikan setelah decision_sessions)
ALTER TABLE `criteria`
    ADD CONSTRAINT `fk_criteria_session` FOREIGN KEY (`session_id`) REFERENCES `decision_sessions` (`id`) ON DELETE CASCADE;
ALTER TABLE `candidates`
    ADD CONSTRAINT `fk_candidates_session` FOREIGN KEY (`session_id`) REFERENCES `decision_sessions` (`id`) ON DELETE CASCADE;
