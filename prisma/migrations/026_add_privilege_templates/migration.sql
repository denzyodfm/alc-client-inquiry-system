CREATE TABLE `privilege_templates` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(120) NOT NULL,
  `description` VARCHAR(255) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  UNIQUE INDEX `privilege_templates_name_key`(`name`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `privilege_permissions` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `privilege_template_id` INTEGER NOT NULL,
  `function_key` VARCHAR(80) NOT NULL,
  INDEX `privilege_permissions_function_key_idx`(`function_key`),
  UNIQUE INDEX `privilege_permissions_privilege_template_id_function_key_key`(`privilege_template_id`, `function_key`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `users` ADD COLUMN `privilege_template_id` INTEGER NULL;
CREATE INDEX `users_privilege_template_id_idx` ON `users`(`privilege_template_id`);

ALTER TABLE `privilege_permissions`
  ADD CONSTRAINT `privilege_permissions_privilege_template_id_fkey`
  FOREIGN KEY (`privilege_template_id`) REFERENCES `privilege_templates`(`id`)
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `users`
  ADD CONSTRAINT `users_privilege_template_id_fkey`
  FOREIGN KEY (`privilege_template_id`) REFERENCES `privilege_templates`(`id`)
  ON DELETE SET NULL ON UPDATE CASCADE;
