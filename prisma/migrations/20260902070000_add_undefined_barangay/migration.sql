-- Plenty of addresses name only a city - "Bayugan City", "Cabadbaran City" - with no barangay
-- at all. Re-tagging demands all three parts, so those loans could not be placed anywhere and
-- sat in Invalid Address permanently.
--
-- Giving every province/municipality an UNDEFINED barangay lets them be tagged honestly: the
-- city is known, the barangay genuinely is not. Because every screen builds its dropdowns from
-- this table, the option appears in all of them without touching any of them.
--
-- The derived table is deliberate: MySQL will not read the table being inserted into directly.
-- INSERT IGNORE leaves any that already exist alone, so re-running is harmless.
INSERT IGNORE INTO `location_masterlist` (`province`, `municipality`, `barangay`, `created_at`, `updated_at`)
SELECT `t`.`province`, `t`.`municipality`, 'UNDEFINED', NOW(3), NOW(3)
FROM (SELECT DISTINCT `province`, `municipality` FROM `location_masterlist`) `t`;
