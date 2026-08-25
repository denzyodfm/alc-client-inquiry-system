ALTER TABLE `client_logs`
  ADD COLUMN `original_new_date` DATE NULL,
  ADD COLUMN `rescheduled_at` DATETIME(3) NULL;
