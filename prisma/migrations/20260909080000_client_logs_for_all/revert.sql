-- Undoes 20260909080000_client_logs_for_all.
--
-- Unlike the rest of this project's migrations, that one changes data rather than structure, so
-- reverting the code does NOT undo it - scripts/rollback.sh would leave the grants in place.
-- Run this by hand if Client Logs has to go back to being closed to these four templates.
DELETE `pp`
FROM `privilege_permissions` `pp`
JOIN `privilege_templates` `t` ON `t`.`id` = `pp`.`privilege_template_id`
WHERE `pp`.`function_key` = 'CLIENT_LOGS'
  AND `t`.`name` IN ('Loan Officer', 'Remedial Officer', 'Branch TL', 'Bookkeeper');
