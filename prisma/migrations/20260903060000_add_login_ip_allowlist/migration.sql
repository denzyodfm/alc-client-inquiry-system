-- Restricts where people may sign in from. Deliberately fails open: an empty list, or a list
-- with nothing enabled, allows everyone - so a half-finished configuration cannot lock the
-- business out of its own system.
CREATE TABLE `login_ip_allowlist` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `address` VARCHAR(64) NOT NULL,
  `label` VARCHAR(120) NULL,
  `enabled` BOOLEAN NOT NULL DEFAULT true,
  `created_by_id` INTEGER NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,

  UNIQUE INDEX `login_ip_allowlist_address_key`(`address`),
  INDEX `login_ip_allowlist_enabled_idx`(`enabled`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `login_ip_allowlist`
  ADD CONSTRAINT `login_ip_allowlist_created_by_id_fkey`
  FOREIGN KEY (`created_by_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
