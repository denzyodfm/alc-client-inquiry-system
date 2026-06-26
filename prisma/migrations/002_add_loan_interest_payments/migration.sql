ALTER TABLE `loans`
  ADD COLUMN `interest_amount` DECIMAL(14, 2) NOT NULL DEFAULT 0 AFTER `principal_amount`,
  ADD COLUMN `paid_amount` DECIMAL(14, 2) NOT NULL DEFAULT 0 AFTER `interest_amount`;
