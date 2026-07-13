CREATE TABLE `co_makers` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `branch_id` INTEGER NOT NULL,
  `loan_id` INTEGER NOT NULL,
  `remote_id` VARCHAR(140) NOT NULL,
  `name` VARCHAR(180) NOT NULL,
  `client_remote_id` VARCHAR(80) NULL,
  `contact_number` VARCHAR(80) NULL,
  `valid_id_number` VARCHAR(120) NULL,
  `address` VARCHAR(255) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,

  UNIQUE INDEX `co_makers_branch_id_remote_id_key`(`branch_id`, `remote_id`),
  INDEX `co_makers_name_idx`(`name`),
  INDEX `co_makers_loan_id_idx`(`loan_id`),
  INDEX `co_makers_client_remote_id_idx`(`client_remote_id`),
  INDEX `co_makers_valid_id_number_idx`(`valid_id_number`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `co_makers` ADD CONSTRAINT `co_makers_branch_id_fkey` FOREIGN KEY (`branch_id`) REFERENCES `branches`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `co_makers` ADD CONSTRAINT `co_makers_loan_id_fkey` FOREIGN KEY (`loan_id`) REFERENCES `loans`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
