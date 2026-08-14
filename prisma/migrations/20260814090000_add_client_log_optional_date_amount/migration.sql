ALTER TABLE `client_logs`
  ADD COLUMN `new_date` DATE NULL,
  ADD COLUMN `new_amount` DECIMAL(14, 2) NULL;
