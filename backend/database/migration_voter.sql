-- Additive migration: Support voter role and session voter snapshot
-- Preserves all existing users, tables, and constraints

ALTER TABLE `users` MODIFY COLUMN `role` ENUM('chair', 'member', 'voter') NOT NULL DEFAULT 'voter';

CREATE TABLE IF NOT EXISTS `session_voters` (
    `session_id` INT NOT NULL,
    `user_id` INT NOT NULL,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`session_id`, `user_id`),
    CONSTRAINT `fk_sv_session` FOREIGN KEY (`session_id`) REFERENCES `decision_sessions` (`id`) ON DELETE CASCADE,
    CONSTRAINT `fk_sv_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
