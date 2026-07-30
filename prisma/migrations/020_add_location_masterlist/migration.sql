CREATE TABLE `location_masterlist` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `province` VARCHAR(120) NOT NULL,
  `municipality` VARCHAR(120) NOT NULL,
  `barangay` VARCHAR(160) NOT NULL,
  `zone` VARCHAR(120) NULL,
  `region` VARCHAR(120) NULL,
  `number_of_clients` INTEGER NULL,
  `portfolio` DECIMAL(16, 2) NULL,
  `current` INTEGER NULL,
  `delayed` INTEGER NULL,
  `past_due` INTEGER NULL,
  `litigated` INTEGER NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,

  UNIQUE INDEX `location_masterlist_province_municipality_barangay_key` (`province`, `municipality`, `barangay`),
  INDEX `location_masterlist_province_municipality_barangay_idx` (`province`, `municipality`, `barangay`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
