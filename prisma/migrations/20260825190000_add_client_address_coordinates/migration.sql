ALTER TABLE `clients`
  ADD COLUMN `address_latitude` DECIMAL(10, 7) NULL,
  ADD COLUMN `address_longitude` DECIMAL(10, 7) NULL,
  ADD COLUMN `address_accuracy` DECIMAL(10, 2) NULL,
  ADD COLUMN `address_coordinate_source` VARCHAR(80) NULL,
  ADD COLUMN `address_geocoded_at` DATETIME(3) NULL,
  ADD COLUMN `address_captured_by` VARCHAR(180) NULL;
