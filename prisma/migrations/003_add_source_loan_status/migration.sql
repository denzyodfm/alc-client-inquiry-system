ALTER TABLE `loans`
  ADD COLUMN `source_status_code` INTEGER NULL AFTER `status`,
  ADD COLUMN `source_status_name` VARCHAR(80) NULL AFTER `source_status_code`;

CREATE INDEX `loans_source_status_name_idx` ON `loans`(`source_status_name`);
