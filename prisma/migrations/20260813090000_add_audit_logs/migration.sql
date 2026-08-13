CREATE TABLE `audit_logs` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `user_id` INTEGER NULL,
  `user_name` VARCHAR(120) NOT NULL,
  `user_email` VARCHAR(160) NULL,
  `action` VARCHAR(60) NOT NULL,
  `module` VARCHAR(120) NULL,
  `details` TEXT NULL,
  `ip_address` VARCHAR(80) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX `audit_logs_user_id_idx`(`user_id`),
  INDEX `audit_logs_action_idx`(`action`),
  INDEX `audit_logs_created_at_idx`(`created_at`),
  PRIMARY KEY (`id`),
  CONSTRAINT `audit_logs_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
