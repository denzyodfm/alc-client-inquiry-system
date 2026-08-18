CREATE TABLE `footer_branding` (
  `id` INTEGER NOT NULL DEFAULT 1,
  `powered_by_label` VARCHAR(80) NOT NULL DEFAULT 'Powered by',
  `partner_name` VARCHAR(180) NOT NULL DEFAULT 'Valdemeer Resources, Inc',
  `it_team_label` VARCHAR(180) NOT NULL DEFAULT 'IT TEAM - KAMARU',
  `updated_at` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

INSERT INTO `footer_branding` (`id`, `powered_by_label`, `partner_name`, `it_team_label`, `updated_at`)
VALUES (1, 'Powered by', 'Valdemeer Resources, Inc', 'IT TEAM - KAMARU', CURRENT_TIMESTAMP(3));
