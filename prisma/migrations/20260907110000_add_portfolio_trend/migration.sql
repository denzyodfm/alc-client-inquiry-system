-- Client count and principal per branch for months that ended before month-end capture began,
-- worked back from payment history. Deliberately a separate table from the month-end snapshots:
-- that one is the record and does not move, this one is an estimate and may be recomputed.
CREATE TABLE `portfolio_trend_points` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `period_end` DATE NOT NULL,
  `branch_id` INTEGER NOT NULL,
  `clients` INTEGER NOT NULL DEFAULT 0,
  `principal` DECIMAL(18, 2) NOT NULL DEFAULT 0,
  `computed_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE INDEX `portfolio_trend_points_period_end_branch_id_key` (`period_end`, `branch_id`),
  INDEX `portfolio_trend_points_period_end_idx` (`period_end`)
) DEFAULT CHARACTER SET utf8mb4;

ALTER TABLE `portfolio_trend_points`
  ADD CONSTRAINT `portfolio_trend_points_branch_id_fkey`
  FOREIGN KEY (`branch_id`) REFERENCES `branches`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
