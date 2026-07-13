ALTER TABLE `branches`
  ADD COLUMN `dynamic_ip` VARCHAR(160) NULL AFTER `public_ip`;
