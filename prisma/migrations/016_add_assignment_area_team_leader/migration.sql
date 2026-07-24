ALTER TABLE `remedial_assignments`
  ADD COLUMN `area_team_leader_id` INT NULL AFTER `assigned_by_id`,
  ADD INDEX `remedial_assignments_area_team_leader_id_idx` (`area_team_leader_id`),
  ADD CONSTRAINT `remedial_assignments_area_team_leader_id_fkey`
    FOREIGN KEY (`area_team_leader_id`) REFERENCES `users` (`id`)
    ON DELETE SET NULL ON UPDATE CASCADE;
