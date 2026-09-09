-- Undoes 20260909093000_restrict_employee_loans.
--
-- This migration changes data, not structure, so scripts/rollback.sh will not undo it. Removing
-- the grants makes EMPLOYEE_LOANS unheld by anyone, which with the reverted code is harmless -
-- the old code never reads the key. Run it only alongside a code rollback.
DELETE `pp`
FROM `privilege_permissions` `pp`
WHERE `pp`.`function_key` = 'EMPLOYEE_LOANS';
