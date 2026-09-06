-- My Schedule: an officer's follow-up and promise-to-pay calendar, built from the dates they
-- record on client logs. Same audience as My Clients, so the same templates get it.
INSERT IGNORE INTO `privilege_permissions` (`privilege_template_id`, `function_key`)
SELECT `t`.`id`, 'MY_SCHEDULE'
FROM `privilege_templates` `t`
WHERE `t`.`name` IN ('Loan Officer', 'Remedial Officer', 'Account Officer', 'Area TL', 'Branch TL');
