-- Flags an outstanding loan whose recorded address is wrong, so it can be pulled out for a
-- team leader to re-tag against the location masterlist.
ALTER TABLE `loans`
  ADD COLUMN `not_valid_address` TINYINT(1) NOT NULL DEFAULT 0;

CREATE INDEX `loans_not_valid_address_idx` ON `loans`(`not_valid_address`);

-- Area TL, Branch TL and Bookkeeper work the Invalid Address list. The join only matches
-- templates that already exist, so a site missing one of these names simply gets the rows it
-- can, rather than the migration failing.
INSERT IGNORE INTO `privilege_permissions` (`privilege_template_id`, `function_key`)
SELECT `t`.`id`, 'INVALID_ADDRESS'
FROM `privilege_templates` `t`
WHERE `t`.`name` IN ('Area TL', 'Area Team Leader', 'Branch TL', 'Branch Team Leader', 'Bookkeeper');
