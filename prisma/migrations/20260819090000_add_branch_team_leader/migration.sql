ALTER TABLE `branches` ADD COLUMN `branch_team_leader_id` INTEGER NULL;

CREATE INDEX `branches_branch_team_leader_id_idx` ON `branches`(`branch_team_leader_id`);

ALTER TABLE `branches` ADD CONSTRAINT `branches_branch_team_leader_id_fkey`
  FOREIGN KEY (`branch_team_leader_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
