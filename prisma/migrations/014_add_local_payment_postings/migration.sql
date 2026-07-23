CREATE TABLE `local_payment_postings` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `branch_id` INT NOT NULL,
  `client_id` INT NOT NULL,
  `loan_id` INT NOT NULL,
  `posted_by_id` INT NOT NULL,
  `mode` VARCHAR(20) NOT NULL,
  `pr_number` VARCHAR(80) NULL,
  `or_number` VARCHAR(80) NULL,
  `payment_type` VARCHAR(80) NOT NULL DEFAULT '0-Cash',
  `cheque_no` VARCHAR(120) NULL,
  `gl_code` VARCHAR(120) NULL,
  `memo_type` VARCHAR(120) NULL,
  `payment_date` DATE NOT NULL,
  `principal_amount` DECIMAL(14, 2) NOT NULL DEFAULT 0,
  `interest_amount` DECIMAL(14, 2) NOT NULL DEFAULT 0,
  `penalty_amount` DECIMAL(14, 2) NOT NULL DEFAULT 0,
  `pdi_amount` DECIMAL(14, 2) NOT NULL DEFAULT 0,
  `other_charges_amount` DECIMAL(14, 2) NOT NULL DEFAULT 0,
  `total_amount` DECIMAL(14, 2) NOT NULL DEFAULT 0,
  `account_officer_changed` BOOLEAN NOT NULL DEFAULT false,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,

  PRIMARY KEY (`id`),
  INDEX `local_payment_postings_branch_id_idx`(`branch_id`),
  INDEX `local_payment_postings_client_id_idx`(`client_id`),
  INDEX `local_payment_postings_loan_id_idx`(`loan_id`),
  INDEX `local_payment_postings_posted_by_id_idx`(`posted_by_id`),
  INDEX `local_payment_postings_payment_date_idx`(`payment_date`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `local_payment_postings` ADD CONSTRAINT `local_payment_postings_branch_id_fkey` FOREIGN KEY (`branch_id`) REFERENCES `branches`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `local_payment_postings` ADD CONSTRAINT `local_payment_postings_client_id_fkey` FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `local_payment_postings` ADD CONSTRAINT `local_payment_postings_loan_id_fkey` FOREIGN KEY (`loan_id`) REFERENCES `loans`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `local_payment_postings` ADD CONSTRAINT `local_payment_postings_posted_by_id_fkey` FOREIGN KEY (`posted_by_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
