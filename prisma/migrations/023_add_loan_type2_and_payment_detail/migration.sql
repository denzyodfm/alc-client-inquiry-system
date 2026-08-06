ALTER TABLE `loans`
  ADD COLUMN `loan_type2_code` INT NULL,
  ADD COLUMN `loan_type2_name` VARCHAR(80) NULL;

ALTER TABLE `payments`
  ADD COLUMN `or_number` VARCHAR(80) NULL,
  ADD COLUMN `amort_no` INT NULL,
  ADD COLUMN `paid_principal` DECIMAL(14, 2) NOT NULL DEFAULT 0,
  ADD COLUMN `paid_interest` DECIMAL(14, 2) NOT NULL DEFAULT 0,
  ADD COLUMN `paid_penalty` DECIMAL(14, 2) NOT NULL DEFAULT 0,
  ADD COLUMN `paid_pdi` DECIMAL(14, 2) NOT NULL DEFAULT 0,
  ADD COLUMN `paid_other_charges` DECIMAL(14, 2) NOT NULL DEFAULT 0,
  ADD COLUMN `paid_ca` DECIMAL(14, 2) NOT NULL DEFAULT 0,
  ADD COLUMN `principal_balance_after` DECIMAL(14, 2) NULL,
  ADD COLUMN `interest_balance_after` DECIMAL(14, 2) NULL,
  ADD COLUMN `penalty_balance_after` DECIMAL(14, 2) NULL,
  ADD COLUMN `pdi_balance_after` DECIMAL(14, 2) NULL,
  ADD COLUMN `other_charges_balance_after` DECIMAL(14, 2) NULL,
  ADD COLUMN `collector` VARCHAR(120) NULL;
