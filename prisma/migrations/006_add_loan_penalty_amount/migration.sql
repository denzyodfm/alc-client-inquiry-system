ALTER TABLE `loans`
  ADD COLUMN `penalty_amount` DECIMAL(14, 2) NOT NULL DEFAULT 0 AFTER `interest_amount`;
