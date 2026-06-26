ALTER TABLE `sync_logs`
  ADD COLUMN `branches_completed` INT NOT NULL DEFAULT 0 AFTER `payments_pulled`,
  ADD COLUMN `branches_failed` INT NOT NULL DEFAULT 0 AFTER `branches_completed`;
