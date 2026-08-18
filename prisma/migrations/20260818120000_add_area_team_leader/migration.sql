ALTER TABLE `areas` ADD COLUMN `area_team_leader_id` INTEGER NULL;

CREATE INDEX `areas_area_team_leader_id_idx` ON `areas`(`area_team_leader_id`);

ALTER TABLE `areas` ADD CONSTRAINT `areas_area_team_leader_id_fkey`
  FOREIGN KEY (`area_team_leader_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
