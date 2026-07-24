ALTER TABLE `remedial_assignments`
  ADD COLUMN `client_condition` VARCHAR(20) NULL AFTER `barangay`,
  ADD COLUMN `condition_approval_status` VARCHAR(20) NULL AFTER `client_condition`,
  ADD COLUMN `condition_reported_by_id` INT NULL AFTER `condition_approval_status`,
  ADD COLUMN `condition_approved_by_id` INT NULL AFTER `condition_reported_by_id`,
  ADD COLUMN `condition_reported_at` DATETIME(3) NULL AFTER `condition_approved_by_id`,
  ADD COLUMN `condition_approved_at` DATETIME(3) NULL AFTER `condition_reported_at`;
