ALTER TABLE `location_masterlist`
  ADD COLUMN `latitude` DECIMAL(10, 7) NULL,
  ADD COLUMN `longitude` DECIMAL(10, 7) NULL,
  ADD COLUMN `coordinate_precision` ENUM('BARANGAY', 'MUNICIPALITY', 'MANUAL') NULL,
  ADD COLUMN `coordinate_source` VARCHAR(120) NULL,
  ADD COLUMN `geocoded_at` DATETIME(3) NULL,
  ADD COLUMN `geocode_error` TEXT NULL,
  ADD COLUMN `retry_after` DATETIME(3) NULL;

CREATE INDEX `location_masterlist_geocode_retry_idx`
  ON `location_masterlist` (`coordinate_precision`, `retry_after`);
