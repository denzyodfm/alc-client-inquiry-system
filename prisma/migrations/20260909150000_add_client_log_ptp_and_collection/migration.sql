ALTER TABLE `client_logs`
  ADD COLUMN `is_ptp` BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN `collection_date` DATE NULL,
  ADD COLUMN `collection_amount` DECIMAL(14, 2) NULL;
