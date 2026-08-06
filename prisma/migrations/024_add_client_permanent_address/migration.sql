ALTER TABLE `clients`
  ADD COLUMN `permanent_address` VARCHAR(255) NULL,
  ADD COLUMN `permanent_province` VARCHAR(120) NULL,
  ADD COLUMN `permanent_municipality` VARCHAR(120) NULL,
  ADD COLUMN `permanent_barangay` VARCHAR(160) NULL;
