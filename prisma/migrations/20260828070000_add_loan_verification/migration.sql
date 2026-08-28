-- Loan verification: a bookkeeper ticks an outstanding loan as checked, which records who
-- did it and when, and moves the loan out of the Verify Loans list into Verified Loans.
ALTER TABLE `loans`
  ADD COLUMN `loan_verified` TINYINT(1) NOT NULL DEFAULT 0,
  ADD COLUMN `verified_at` DATETIME(3) NULL,
  ADD COLUMN `verified_by_id` INT NULL;

CREATE INDEX `loans_loan_verified_idx` ON `loans`(`loan_verified`);
CREATE INDEX `loans_verified_by_id_idx` ON `loans`(`verified_by_id`);

ALTER TABLE `loans`
  ADD CONSTRAINT `loans_verified_by_id_fkey`
  FOREIGN KEY (`verified_by_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- The privilege that carries the new screens. Names are unique, so INSERT IGNORE leaves an
-- existing Bookkeeper template untouched rather than failing the migration.
INSERT IGNORE INTO `privilege_templates` (`name`, `description`, `created_at`, `updated_at`)
VALUES ('Bookkeeper', 'Verifies outstanding branch loans and reviews the verified loan record', NOW(3), NOW(3));

INSERT IGNORE INTO `privilege_permissions` (`privilege_template_id`, `function_key`)
SELECT `t`.`id`, `k`.`function_key`
FROM `privilege_templates` `t`
JOIN (
  SELECT 'VERIFY_LOANS' AS `function_key`
  UNION ALL SELECT 'VERIFIED_LOANS'
  UNION ALL SELECT 'DASHBOARD'
) `k`
WHERE `t`.`name` = 'Bookkeeper';
