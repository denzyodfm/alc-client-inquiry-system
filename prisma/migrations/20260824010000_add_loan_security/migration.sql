ALTER TABLE `loans` ADD COLUMN `loan_security_code` VARCHAR(20) NULL;
ALTER TABLE `loans` ADD COLUMN `loan_security_name` VARCHAR(120) NULL;

CREATE INDEX `loans_loan_security_code_idx` ON `loans`(`loan_security_code`);
