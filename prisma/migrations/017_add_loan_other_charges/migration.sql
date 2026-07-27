ALTER TABLE `loans`
  ADD COLUMN `other_charges_amount` DECIMAL(14, 2) NOT NULL DEFAULT 0 AFTER `penalty_amount`;
