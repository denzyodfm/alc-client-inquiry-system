CREATE TABLE `client_logs` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `client_id` INTEGER NOT NULL,
  `branch_id` INTEGER NOT NULL,
  `encoded_by_id` INTEGER NOT NULL,
  `log_type` VARCHAR(60) NOT NULL DEFAULT 'INQUIRY',
  `subject` VARCHAR(180) NULL,
  `notes` TEXT NOT NULL,
  `visit_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,

  INDEX `client_logs_client_id_idx`(`client_id`),
  INDEX `client_logs_branch_id_idx`(`branch_id`),
  INDEX `client_logs_encoded_by_id_idx`(`encoded_by_id`),
  INDEX `client_logs_visit_at_idx`(`visit_at`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `client_logs` ADD CONSTRAINT `client_logs_client_id_fkey` FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `client_logs` ADD CONSTRAINT `client_logs_branch_id_fkey` FOREIGN KEY (`branch_id`) REFERENCES `branches`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `client_logs` ADD CONSTRAINT `client_logs_encoded_by_id_fkey` FOREIGN KEY (`encoded_by_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
