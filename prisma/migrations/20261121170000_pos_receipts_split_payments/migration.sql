ALTER TABLE `PosOrder`
  MODIFY `status` ENUM('held', 'paid', 'cancelled') NOT NULL,
  ADD COLUMN `changeDue` DECIMAL(14, 2) NOT NULL DEFAULT 0;

CREATE TABLE `PosOrderPayment` (
  `id` VARCHAR(191) NOT NULL,
  `orderId` VARCHAR(191) NOT NULL,
  `paymentMethodId` VARCHAR(191) NOT NULL,
  `amountReceived` DECIMAL(14, 2) NOT NULL,
  `amountApplied` DECIMAL(14, 2) NOT NULL,
  UNIQUE INDEX `PosOrderPayment_orderId_paymentMethodId_key` (`orderId`, `paymentMethodId`),
  INDEX `PosOrderPayment_paymentMethodId_idx` (`paymentMethodId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `PosOrderPayment`
  ADD CONSTRAINT `PosOrderPayment_orderId_fkey` FOREIGN KEY (`orderId`) REFERENCES `PosOrder`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `PosOrderPayment_paymentMethodId_fkey` FOREIGN KEY (`paymentMethodId`) REFERENCES `CustomLabels`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
