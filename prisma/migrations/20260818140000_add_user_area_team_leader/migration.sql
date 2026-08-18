ALTER TABLE `users` ADD COLUMN `area_team_leader_id` INTEGER NULL;

CREATE INDEX `users_area_team_leader_id_idx` ON `users`(`area_team_leader_id`);

ALTER TABLE `users` ADD CONSTRAINT `users_area_team_leader_id_fkey`
  FOREIGN KEY (`area_team_leader_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
