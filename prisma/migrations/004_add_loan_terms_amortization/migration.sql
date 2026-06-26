ALTER TABLE `loans`
  ADD COLUMN `interest_rate` DECIMAL(8, 4) NOT NULL DEFAULT 0 AFTER `principal_amount`,
  ADD COLUMN `terms` VARCHAR(40) NULL AFTER `interest_amount`;

CREATE TABLE `amortization_schedules` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `branch_id` INTEGER NOT NULL,
  `loan_id` INTEGER NOT NULL,
  `remote_id` VARCHAR(80) NOT NULL,
  `amort_no` INTEGER NOT NULL,
  `amort_date` DATE NULL,
  `principal_balance` DECIMAL(14, 2) NOT NULL DEFAULT 0,
  `interest_balance` DECIMAL(14, 2) NOT NULL DEFAULT 0,
  `principal_amort` DECIMAL(14, 2) NOT NULL DEFAULT 0,
  `interest_amort` DECIMAL(14, 2) NOT NULL DEFAULT 0,
  `total_amort` DECIMAL(14, 2) NOT NULL DEFAULT 0,
  `paid_principal` DECIMAL(14, 2) NOT NULL DEFAULT 0,
  `paid_interest` DECIMAL(14, 2) NOT NULL DEFAULT 0,
  `paid_total` DECIMAL(14, 2) NOT NULL DEFAULT 0,
  `paid_status` INTEGER NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  UNIQUE INDEX `amortization_schedules_branch_id_remote_id_key`(`branch_id`, `remote_id`),
  INDEX `amortization_schedules_loan_id_idx`(`loan_id`),
  INDEX `amortization_schedules_amort_date_idx`(`amort_date`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `amortization_schedules` ADD CONSTRAINT `amortization_schedules_branch_id_fkey` FOREIGN KEY (`branch_id`) REFERENCES `branches`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `amortization_schedules` ADD CONSTRAINT `amortization_schedules_loan_id_fkey` FOREIGN KEY (`loan_id`) REFERENCES `loans`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
