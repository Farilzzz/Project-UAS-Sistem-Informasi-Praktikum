-- MANUAL migration: explicitly select the intended database and back it up first.
-- Stop application writes for the entire import (DDL implicitly commits).
-- Run with mysql/MariaDB client delimiter support and CREATE ROUTINE privilege.
-- Never guesses ownership, deletes rows, or disables foreign-key checks.
-- On refusal: inspect/fix ownership manually, then rerun this file.
-- A failed CALL may leave this migration-only routine; the next run replaces it.
DELIMITER $$
DROP PROCEDURE IF EXISTS gdss_migrate_session_integrity$$
CREATE PROCEDURE gdss_migrate_session_integrity()
BEGIN
    IF @@FOREIGN_KEY_CHECKS <> 1 THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'GDSS migration refused: enable FOREIGN_KEY_CHECKS first';
    END IF;

    -- Complete data preflight BEFORE any table DDL; NULL ownership is ambiguous.
    IF EXISTS (SELECT 1 FROM candidates c LEFT JOIN decision_sessions s ON s.id = c.session_id
               WHERE c.session_id IS NULL OR s.id IS NULL)
       OR EXISTS (SELECT 1 FROM criteria c LEFT JOIN decision_sessions s ON s.id = c.session_id
                  WHERE c.session_id IS NULL OR s.id IS NULL) THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'GDSS migration refused: NULL or orphan master session_id; manual review required';
    END IF;
    IF EXISTS (SELECT 1 FROM assessments a
               LEFT JOIN candidates c ON c.id = a.candidate_id AND c.session_id = a.session_id
               LEFT JOIN criteria k ON k.id = a.criterion_id AND k.session_id = a.session_id
               WHERE c.id IS NULL OR k.id IS NULL) THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'GDSS migration refused: orphan or cross-session assessment; manual review required';
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema = DATABASE() AND table_name = 'candidates'
                 AND column_name = 'session_id' AND is_nullable = 'YES') THEN
        ALTER TABLE `candidates` MODIFY `session_id` INT NOT NULL;
    END IF;
    IF NOT EXISTS (SELECT index_name FROM information_schema.statistics
                   WHERE table_schema = DATABASE() AND table_name = 'candidates'
                   GROUP BY index_name
                   HAVING MAX(non_unique) = 0 AND COUNT(*) = 2
                      AND GROUP_CONCAT(column_name ORDER BY seq_in_index) = 'session_id,id') THEN
        ALTER TABLE `candidates` ADD UNIQUE KEY `uq_candidates_session_id` (`session_id`, `id`);
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema = DATABASE() AND table_name = 'criteria'
                 AND column_name = 'session_id' AND is_nullable = 'YES') THEN
        ALTER TABLE `criteria` MODIFY `session_id` INT NOT NULL;
    END IF;
    IF NOT EXISTS (SELECT index_name FROM information_schema.statistics
                   WHERE table_schema = DATABASE() AND table_name = 'criteria'
                   GROUP BY index_name
                   HAVING MAX(non_unique) = 0 AND COUNT(*) = 2
                      AND GROUP_CONCAT(column_name ORDER BY seq_in_index) = 'session_id,id') THEN
        ALTER TABLE `criteria` ADD UNIQUE KEY `uq_criteria_session_id` (`session_id`, `id`);
    END IF;
    IF NOT EXISTS (SELECT constraint_name FROM information_schema.key_column_usage
                   WHERE constraint_schema = DATABASE() AND table_name = 'candidates'
                     AND referenced_table_schema = DATABASE() AND referenced_table_name = 'decision_sessions'
                   GROUP BY constraint_name
                   HAVING GROUP_CONCAT(column_name ORDER BY ordinal_position) = 'session_id'
                      AND GROUP_CONCAT(referenced_column_name ORDER BY ordinal_position) = 'id') THEN
        ALTER TABLE `candidates` ADD CONSTRAINT `fk_candidates_session`
            FOREIGN KEY (`session_id`) REFERENCES `decision_sessions` (`id`) ON DELETE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT constraint_name FROM information_schema.key_column_usage
                   WHERE constraint_schema = DATABASE() AND table_name = 'criteria'
                     AND referenced_table_schema = DATABASE() AND referenced_table_name = 'decision_sessions'
                   GROUP BY constraint_name
                   HAVING GROUP_CONCAT(column_name ORDER BY ordinal_position) = 'session_id'
                      AND GROUP_CONCAT(referenced_column_name ORDER BY ordinal_position) = 'id') THEN
        ALTER TABLE `criteria` ADD CONSTRAINT `fk_criteria_session`
            FOREIGN KEY (`session_id`) REFERENCES `decision_sessions` (`id`) ON DELETE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT constraint_name FROM information_schema.key_column_usage
                   WHERE constraint_schema = DATABASE() AND table_name = 'assessments'
                     AND referenced_table_schema = DATABASE() AND referenced_table_name = 'candidates'
                   GROUP BY constraint_name
                   HAVING GROUP_CONCAT(column_name ORDER BY ordinal_position) = 'session_id,candidate_id'
                      AND GROUP_CONCAT(referenced_column_name ORDER BY ordinal_position) = 'session_id,id') THEN
        ALTER TABLE `assessments` ADD CONSTRAINT `fk_assessments_candidate_session`
            FOREIGN KEY (`session_id`, `candidate_id`) REFERENCES `candidates` (`session_id`, `id`) ON DELETE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT constraint_name FROM information_schema.key_column_usage
                   WHERE constraint_schema = DATABASE() AND table_name = 'assessments'
                     AND referenced_table_schema = DATABASE() AND referenced_table_name = 'criteria'
                   GROUP BY constraint_name
                   HAVING GROUP_CONCAT(column_name ORDER BY ordinal_position) = 'session_id,criterion_id'
                      AND GROUP_CONCAT(referenced_column_name ORDER BY ordinal_position) = 'session_id,id') THEN
        ALTER TABLE `assessments` ADD CONSTRAINT `fk_assessments_criterion_session`
            FOREIGN KEY (`session_id`, `criterion_id`) REFERENCES `criteria` (`session_id`, `id`) ON DELETE CASCADE;
    END IF;
END$$
CALL gdss_migrate_session_integrity()$$
DROP PROCEDURE gdss_migrate_session_integrity$$
DELIMITER ;
