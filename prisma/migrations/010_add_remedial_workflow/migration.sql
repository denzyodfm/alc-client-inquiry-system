ALTER TABLE `users`
  MODIFY `role` ENUM('ADMIN', 'INQUIRY_USER', 'AUDITOR', 'ACCOUNT_OFFICER', 'AREA_TEAM_LEADER', 'CREDIT_COMMITTEE') NOT NULL DEFAULT 'INQUIRY_USER',
  ADD COLUMN `all_branches` BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE `user_branch_access` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `user_id` INTEGER NOT NULL,
  `branch_id` INTEGER NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  UNIQUE INDEX `user_branch_access_user_id_branch_id_key`(`user_id`, `branch_id`),
  INDEX `user_branch_access_branch_id_idx`(`branch_id`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `remedial_assignments` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `loan_id` INTEGER NOT NULL,
  `branch_id` INTEGER NOT NULL,
  `assigned_to_id` INTEGER NOT NULL,
  `assigned_by_id` INTEGER NULL,
  `status` ENUM('ACTIVE', 'CLOSED') NOT NULL DEFAULT 'ACTIVE',
  `assignment_notes` TEXT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,

  UNIQUE INDEX `remedial_assignments_loan_id_key`(`loan_id`),
  INDEX `remedial_assignments_branch_id_idx`(`branch_id`),
  INDEX `remedial_assignments_assigned_to_id_idx`(`assigned_to_id`),
  INDEX `remedial_assignments_status_idx`(`status`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `remedial_visits` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `assignment_id` INTEGER NOT NULL,
  `scheduled_date` DATE NOT NULL,
  `schedule_notes` TEXT NULL,
  `status` ENUM('PENDING_APPROVAL', 'APPROVED', 'COMPLETED', 'REJECTED') NOT NULL DEFAULT 'PENDING_APPROVAL',
  `visit_notes` TEXT NULL,
  `negotiation_notes` TEXT NULL,
  `promised_amount` DECIMAL(14, 2) NOT NULL DEFAULT 0,
  `paid_amount` DECIMAL(14, 2) NOT NULL DEFAULT 0,
  `next_visit_date` DATE NULL,
  `created_by_id` INTEGER NULL,
  `approved_by_id` INTEGER NULL,
  `approved_at` DATETIME(3) NULL,
  `completed_at` DATETIME(3) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,

  INDEX `remedial_visits_assignment_id_idx`(`assignment_id`),
  INDEX `remedial_visits_scheduled_date_idx`(`scheduled_date`),
  INDEX `remedial_visits_status_idx`(`status`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `user_branch_access`
  ADD CONSTRAINT `user_branch_access_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `user_branch_access_branch_id_fkey` FOREIGN KEY (`branch_id`) REFERENCES `branches`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `remedial_assignments`
  ADD CONSTRAINT `remedial_assignments_loan_id_fkey` FOREIGN KEY (`loan_id`) REFERENCES `loans`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `remedial_assignments_branch_id_fkey` FOREIGN KEY (`branch_id`) REFERENCES `branches`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `remedial_assignments_assigned_to_id_fkey` FOREIGN KEY (`assigned_to_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `remedial_assignments_assigned_by_id_fkey` FOREIGN KEY (`assigned_by_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `remedial_visits`
  ADD CONSTRAINT `remedial_visits_assignment_id_fkey` FOREIGN KEY (`assignment_id`) REFERENCES `remedial_assignments`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `remedial_visits_created_by_id_fkey` FOREIGN KEY (`created_by_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `remedial_visits_approved_by_id_fkey` FOREIGN KEY (`approved_by_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
