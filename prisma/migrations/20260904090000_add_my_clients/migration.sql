-- My Clients: an Account Officer's own book, grouped the way the Location Masterlist groups
-- the whole portfolio. Loan Officers and Remedial Officers read their own; an administrator
-- picks whose to read.
--
-- The join only matches templates that already exist, so a site missing one of these names
-- gets the rows it can rather than failing the migration.
INSERT IGNORE INTO `privilege_permissions` (`privilege_template_id`, `function_key`)
SELECT `t`.`id`, 'MY_CLIENTS'
FROM `privilege_templates` `t`
WHERE `t`.`name` IN ('Loan Officer', 'Remedial Officer', 'Account Officer', 'Administrator', 'Admin');
