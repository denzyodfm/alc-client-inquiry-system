ALTER TABLE `loans`
  ADD COLUMN `location_masterlist_id` INTEGER NULL,
  ADD COLUMN `location_linked` BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN `location_linked_at` DATETIME(3) NULL,
  ADD INDEX `loans_location_linked_idx` (`location_linked`),
  ADD INDEX `loans_location_masterlist_id_idx` (`location_masterlist_id`);

ALTER TABLE `loans`
  ADD CONSTRAINT `loans_location_masterlist_id_fkey`
  FOREIGN KEY (`location_masterlist_id`) REFERENCES `location_masterlist` (`id`)
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE `location_link_runs` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `trigger` VARCHAR(20) NOT NULL,
  `status` VARCHAR(20) NOT NULL,
  `started_by_id` INTEGER NULL,
  `started_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `finished_at` DATETIME(3) NULL,
  `loans_scanned` INTEGER NOT NULL DEFAULT 0,
  `loans_linked` INTEGER NOT NULL DEFAULT 0,
  `loans_unmatched` INTEGER NOT NULL DEFAULT 0,
  `message` TEXT NULL,
  INDEX `location_link_runs_started_at_idx` (`started_at`),
  INDEX `location_link_runs_status_idx` (`status`),
  INDEX `location_link_runs_started_by_id_idx` (`started_by_id`),
  PRIMARY KEY (`id`),
  CONSTRAINT `location_link_runs_started_by_id_fkey`
    FOREIGN KEY (`started_by_id`) REFERENCES `users` (`id`)
    ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
