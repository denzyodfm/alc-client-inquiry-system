ALTER TABLE `amortization_schedules`
  ADD COLUMN `client_id` INTEGER NULL AFTER `branch_id`;

UPDATE `amortization_schedules` schedule
INNER JOIN `loans` loan ON loan.`id` = schedule.`loan_id`
SET schedule.`client_id` = loan.`client_id`
WHERE schedule.`client_id` IS NULL;

CREATE INDEX `amortization_schedules_client_id_idx` ON `amortization_schedules`(`client_id`);

ALTER TABLE `amortization_schedules` ADD CONSTRAINT `amortization_schedules_client_id_fkey` FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
