CREATE TABLE `users` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(120) NOT NULL,
  `email` VARCHAR(160) NOT NULL,
  `password_hash` VARCHAR(255) NOT NULL,
  `role` ENUM('ADMIN', 'INQUIRY_USER', 'AUDITOR') NOT NULL DEFAULT 'INQUIRY_USER',
  `is_active` BOOLEAN NOT NULL DEFAULT true,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  UNIQUE INDEX `users_email_key`(`email`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `branches` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `branch_name` VARCHAR(140) NOT NULL,
  `branch_code` VARCHAR(40) NOT NULL,
  `public_ip` VARCHAR(80) NULL,
  `db_host` VARCHAR(160) NOT NULL,
  `db_name` VARCHAR(120) NOT NULL,
  `db_user` VARCHAR(120) NOT NULL,
  `encrypted_db_password` TEXT NOT NULL,
  `status` ENUM('ACTIVE', 'INACTIVE', 'MAINTENANCE') NOT NULL DEFAULT 'ACTIVE',
  `last_sync_at` DATETIME(3) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  UNIQUE INDEX `branches_branch_code_key`(`branch_code`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `clients` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `branch_id` INTEGER NOT NULL,
  `remote_id` VARCHAR(80) NOT NULL,
  `client_id` VARCHAR(80) NULL,
  `full_name` VARCHAR(180) NOT NULL,
  `birthdate` DATE NULL,
  `contact_number` VARCHAR(80) NULL,
  `valid_id_number` VARCHAR(120) NULL,
  `address` VARCHAR(255) NULL,
  `remote_updated_at` DATETIME(3) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  UNIQUE INDEX `clients_branch_id_remote_id_key`(`branch_id`, `remote_id`),
  INDEX `clients_full_name_idx`(`full_name`),
  INDEX `clients_birthdate_idx`(`birthdate`),
  INDEX `clients_contact_number_idx`(`contact_number`),
  INDEX `clients_client_id_idx`(`client_id`),
  INDEX `clients_valid_id_number_idx`(`valid_id_number`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `loans` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `branch_id` INTEGER NOT NULL,
  `client_id` INTEGER NOT NULL,
  `remote_id` VARCHAR(80) NOT NULL,
  `loan_number` VARCHAR(100) NULL,
  `principal_amount` DECIMAL(14, 2) NOT NULL DEFAULT 0,
  `balance` DECIMAL(14, 2) NOT NULL DEFAULT 0,
  `status` ENUM('ACTIVE', 'PAID', 'CLOSED', 'WRITTEN_OFF') NOT NULL DEFAULT 'ACTIVE',
  `released_at` DATE NULL,
  `maturity_at` DATE NULL,
  `remote_updated_at` DATETIME(3) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  UNIQUE INDEX `loans_branch_id_remote_id_key`(`branch_id`, `remote_id`),
  INDEX `loans_balance_idx`(`balance`),
  INDEX `loans_loan_number_idx`(`loan_number`),
  INDEX `loans_client_id_idx`(`client_id`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `payments` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `branch_id` INTEGER NOT NULL,
  `client_id` INTEGER NOT NULL,
  `loan_id` INTEGER NULL,
  `remote_id` VARCHAR(80) NOT NULL,
  `amount` DECIMAL(14, 2) NOT NULL DEFAULT 0,
  `paid_at` DATE NULL,
  `remote_updated_at` DATETIME(3) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  UNIQUE INDEX `payments_branch_id_remote_id_key`(`branch_id`, `remote_id`),
  INDEX `payments_paid_at_idx`(`paid_at`),
  INDEX `payments_client_id_idx`(`client_id`),
  INDEX `payments_loan_id_idx`(`loan_id`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `sync_logs` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `branch_id` INTEGER NULL,
  `status` ENUM('SUCCESS', 'FAILED', 'PARTIAL') NOT NULL,
  `started_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `finished_at` DATETIME(3) NULL,
  `clients_pulled` INTEGER NOT NULL DEFAULT 0,
  `loans_pulled` INTEGER NOT NULL DEFAULT 0,
  `payments_pulled` INTEGER NOT NULL DEFAULT 0,
  `message` TEXT NULL,
  INDEX `sync_logs_started_at_idx`(`started_at`),
  INDEX `sync_logs_branch_id_idx`(`branch_id`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `clients` ADD CONSTRAINT `clients_branch_id_fkey` FOREIGN KEY (`branch_id`) REFERENCES `branches`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `loans` ADD CONSTRAINT `loans_branch_id_fkey` FOREIGN KEY (`branch_id`) REFERENCES `branches`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `loans` ADD CONSTRAINT `loans_client_id_fkey` FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `payments` ADD CONSTRAINT `payments_branch_id_fkey` FOREIGN KEY (`branch_id`) REFERENCES `branches`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `payments` ADD CONSTRAINT `payments_client_id_fkey` FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `payments` ADD CONSTRAINT `payments_loan_id_fkey` FOREIGN KEY (`loan_id`) REFERENCES `loans`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `sync_logs` ADD CONSTRAINT `sync_logs_branch_id_fkey` FOREIGN KEY (`branch_id`) REFERENCES `branches`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
