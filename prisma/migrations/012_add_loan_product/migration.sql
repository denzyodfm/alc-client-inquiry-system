ALTER TABLE `loans`
  ADD COLUMN `loan_product` VARCHAR(120) NULL AFTER `loan_number`,
  ADD INDEX `loans_loan_product_idx`(`loan_product`);
