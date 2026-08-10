ALTER TABLE `users`
  ADD COLUMN `position` VARCHAR(120) NULL,
  ADD COLUMN `base_branch_id` INTEGER NULL;

CREATE INDEX `users_base_branch_id_idx` ON `users`(`base_branch_id`);

ALTER TABLE `users`
  ADD CONSTRAINT `users_base_branch_id_fkey`
  FOREIGN KEY (`base_branch_id`) REFERENCES `branches`(`id`)
  ON DELETE SET NULL ON UPDATE CASCADE;
