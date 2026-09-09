-- Staff loans become a privilege of their own.
--
-- What a colleague borrowed, and whether they are behind on it, should not be searchable by the
-- rest of the company. Until now this was hardcoded as "hide from ACCOUNT_OFFICER" in a few
-- layouts and not applied at all in the others. It is now the EMPLOYEE_LOANS privilege, granted
-- to the three templates that are meant to see them. Admin is not listed because
-- canAccessFunction already lets Admin through every function.
--
-- Left without it, and so no longer able to see staff loans: Loan Officer, Remedial Officer,
-- Branch TL, Bookkeeper, and the unused Account Officer template.
INSERT IGNORE INTO `privilege_permissions` (`privilege_template_id`, `function_key`)
SELECT `t`.`id`, 'EMPLOYEE_LOANS'
FROM `privilege_templates` `t`
WHERE `t`.`name` IN ('Area TL', 'Finance Manager', 'HO TL');
