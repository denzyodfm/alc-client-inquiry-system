-- The loan book as it stood at the end of a month, kept because it must not move afterwards.
--
-- These figures cannot be recomputed later. Whether a client counts as current, delayed, past
-- due or litigated is judged against the amortisations that had fallen due by that date and
-- what was paid on them by then - so a payment made in November changes what October would
-- look like if it were worked out again today. Each month is captured once and left alone.
CREATE TABLE `monthly_portfolio_snapshots` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `period_end` DATE NOT NULL,
  `branch_id` INTEGER NOT NULL,
  `clients` INTEGER NOT NULL DEFAULT 0,
  `loans` INTEGER NOT NULL DEFAULT 0,
  `principal` DECIMAL(18, 2) NOT NULL DEFAULT 0,
  `current_clients` INTEGER NOT NULL DEFAULT 0,
  `current_principal` DECIMAL(18, 2) NOT NULL DEFAULT 0,
  `delayed_clients` INTEGER NOT NULL DEFAULT 0,
  `delayed_principal` DECIMAL(18, 2) NOT NULL DEFAULT 0,
  `past_due_clients` INTEGER NOT NULL DEFAULT 0,
  `past_due_principal` DECIMAL(18, 2) NOT NULL DEFAULT 0,
  `litigated_clients` INTEGER NOT NULL DEFAULT 0,
  `litigated_principal` DECIMAL(18, 2) NOT NULL DEFAULT 0,
  `captured_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE INDEX `monthly_portfolio_snapshots_period_end_branch_id_key` (`period_end`, `branch_id`),
  INDEX `monthly_portfolio_snapshots_period_end_idx` (`period_end`)
) DEFAULT CHARACTER SET utf8mb4;

ALTER TABLE `monthly_portfolio_snapshots`
  ADD CONSTRAINT `monthly_portfolio_snapshots_branch_id_fkey`
  FOREIGN KEY (`branch_id`) REFERENCES `branches`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- Monthly Reports is a management view of the whole book, so it follows the same audience as
-- the other head-office reporting rather than the field layouts.
INSERT IGNORE INTO `privilege_permissions` (`privilege_template_id`, `function_key`)
SELECT `t`.`id`, 'MONTHLY_REPORTS'
FROM `privilege_templates` `t`
WHERE `t`.`name` IN ('Area TL', 'Branch TL', 'Finance Manager', 'HO TL', 'Bookkeeper');
