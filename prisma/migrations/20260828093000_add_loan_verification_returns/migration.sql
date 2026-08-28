-- Sending a verified loan back clears the account and timestamp on the loan itself, so the
-- original check would leave no trace. Each return is logged here with both halves: who had
-- verified it and when, and who returned it and when.
CREATE TABLE `loan_verification_returns` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `loan_id` INTEGER NOT NULL,
  `returned_by_id` INTEGER NULL,
  `returned_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `previously_verified_by_id` INTEGER NULL,
  `previously_verified_at` DATETIME(3) NULL,

  INDEX `loan_verification_returns_loan_id_idx`(`loan_id`),
  INDEX `loan_verification_returns_returned_by_id_idx`(`returned_by_id`),
  INDEX `loan_verification_returns_returned_at_idx`(`returned_at`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `loan_verification_returns`
  ADD CONSTRAINT `loan_verification_returns_loan_id_fkey`
  FOREIGN KEY (`loan_id`) REFERENCES `loans`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `loan_verification_returns`
  ADD CONSTRAINT `loan_verification_returns_returned_by_id_fkey`
  FOREIGN KEY (`returned_by_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `loan_verification_returns`
  ADD CONSTRAINT `loan_verification_returns_previously_verified_by_id_fkey`
  FOREIGN KEY (`previously_verified_by_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
