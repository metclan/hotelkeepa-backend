CREATE TABLE `StockAdjustmentMemo` (
  `id` VARCHAR(191) NOT NULL PRIMARY KEY,
  `effectiveDate` DATE NOT NULL,
  `note` TEXT NULL
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE `ProductStockAdjustment` ADD COLUMN `memoId` VARCHAR(191) NULL;
INSERT INTO `StockAdjustmentMemo` (`id`, `effectiveDate`)
SELECT a.id, COALESCE(MIN(m.effectiveDate), DATE(a.createdAt))
FROM `ProductStockAdjustment` a LEFT JOIN `StockMovement` m ON m.referenceId = a.id AND m.type = 'adjustment'
GROUP BY a.id, a.createdAt;
UPDATE `ProductStockAdjustment` SET `memoId` = `id`;
ALTER TABLE `ProductStockAdjustment` MODIFY `memoId` VARCHAR(191) NOT NULL,
ADD CONSTRAINT `ProductStockAdjustment_memoId_fkey` FOREIGN KEY (`memoId`) REFERENCES `StockAdjustmentMemo` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
