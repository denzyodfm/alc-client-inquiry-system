ALTER TABLE `users` ADD COLUMN `branch_team_leader_id` INTEGER NULL;

CREATE INDEX `users_branch_team_leader_id_idx` ON `users`(`branch_team_leader_id`);

ALTER TABLE `users` ADD CONSTRAINT `users_branch_team_leader_id_fkey`
  FOREIGN KEY (`branch_team_leader_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
