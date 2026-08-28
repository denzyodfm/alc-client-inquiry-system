-- Splits the verification queue into the backlog that existed on a baseline date and the
-- loans that have synced in since. One row for the whole organisation.
CREATE TABLE `verification_baseline` (
  `id` INTEGER NOT NULL DEFAULT 1,
  `start_date` DATE NOT NULL,
  `updated_at` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Seeded to today, so the queue standing when this ships becomes the backlog and everything
-- arriving afterwards is counted separately from day one.
INSERT INTO `verification_baseline` (`id`, `start_date`, `updated_at`)
VALUES (1, CURDATE(), NOW(3));
