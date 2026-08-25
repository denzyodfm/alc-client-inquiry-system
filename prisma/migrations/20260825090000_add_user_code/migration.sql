ALTER TABLE `users` ADD COLUMN `user_code` VARCHAR(40) NULL;

CREATE UNIQUE INDEX `users_user_code_key` ON `users`(`user_code`);
