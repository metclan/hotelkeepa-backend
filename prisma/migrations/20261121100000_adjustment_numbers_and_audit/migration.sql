ALTER TABLE `StockAdjustmentMemo` ADD COLUMN `memoNumber` VARCHAR(191) NULL, ADD COLUMN `deletedAt` DATETIME(3) NULL;
UPDATE `StockAdjustmentMemo` m JOIN (
  SELECT records.memoId, ROW_NUMBER() OVER (PARTITION BY records.locationId ORDER BY records.effectiveDate, records.memoId) AS sequenceNo
  FROM (
    SELECT a.memoId, MIN(i.locationId) AS locationId, MIN(m.effectiveDate) AS effectiveDate
    FROM `ProductStockAdjustment` a JOIN `ProductInventory` i ON i.productId = a.productId AND i.departmentId = a.departmentId
    JOIN `StockAdjustmentMemo` m ON m.id = a.memoId
    GROUP BY a.memoId
  ) records
) numbered ON numbered.memoId = m.id
SET m.memoNumber = CONCAT('SA-', YEAR(m.effectiveDate), '-', LPAD(numbered.sequenceNo, GREATEST(4, LENGTH(numbered.sequenceNo)), '0'));
INSERT INTO `DocumentSequence` (`id`, `locationId`, `transactionType`, `currentNumber`, `createdAt`, `updatedAt`)
SELECT UUID(), i.locationId, 'stock_adjustment', COUNT(DISTINCT a.memoId), NOW(3), NOW(3)
FROM `ProductStockAdjustment` a JOIN `ProductInventory` i ON i.productId = a.productId AND i.departmentId = a.departmentId
GROUP BY i.locationId
ON DUPLICATE KEY UPDATE `currentNumber` = GREATEST(`currentNumber`, VALUES(`currentNumber`));
ALTER TABLE `StockAdjustmentMemo` MODIFY COLUMN `memoNumber` VARCHAR(191) NOT NULL;
ALTER TABLE `StockMovement` MODIFY `type` ENUM('opening', 'adjustment', 'transfer', 'purchase', 'sale', 'adjustment_edited', 'adjustment_deleted') NOT NULL;
