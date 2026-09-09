-- Everyone who works with clients can search them.
--
-- Client Logs was granted to the "Account Officer" template, but the officers who actually use
-- it hold "Loan Officer" or "Remedial Officer" - different templates, so they never matched.
-- Bookkeeper and Branch TL were never granted it either. That left 25 of 32 active users unable
-- to open the layout at all, which read as "search does not work for anyone but the admin".
--
-- Branch scoping is unchanged: an Account Officer still sees their own branch's logs, which is
-- decided in getClientLogBranchIds rather than here.
INSERT IGNORE INTO `privilege_permissions` (`privilege_template_id`, `function_key`)
SELECT `t`.`id`, 'CLIENT_LOGS'
FROM `privilege_templates` `t`
WHERE `t`.`name` IN ('Loan Officer', 'Remedial Officer', 'Branch TL', 'Bookkeeper');
