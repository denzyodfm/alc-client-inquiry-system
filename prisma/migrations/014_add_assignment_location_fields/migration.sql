ALTER TABLE `remedial_assignments`
  ADD COLUMN `province` VARCHAR(120) NULL AFTER `division`,
  ADD COLUMN `municipality` VARCHAR(120) NULL AFTER `province`,
  ADD COLUMN `barangay` VARCHAR(120) NULL AFTER `municipality`;
