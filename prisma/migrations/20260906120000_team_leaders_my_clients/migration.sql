-- Area TLs and Branch TLs read My Clients too, for the officers they lead: an Area TL sees the
-- Remedial Officers in their area, a Branch TL the Loan Officers in their branch. They already
-- had My Schedule on the same footing.
INSERT IGNORE INTO `privilege_permissions` (`privilege_template_id`, `function_key`)
SELECT `t`.`id`, 'MY_CLIENTS'
FROM `privilege_templates` `t`
WHERE `t`.`name` IN ('Area TL', 'Branch TL');
