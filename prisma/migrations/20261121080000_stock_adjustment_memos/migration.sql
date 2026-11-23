ALTER TABLE `StockMovement` MODIFY `type` ENUM('opening', 'adjustment', 'transfer', 'purchase', 'sale') NOT NULL;

CREATE TABLE `ProductStockAdjustment` (
  `id` VARCHAR(191) NOT NULL,
  `productId` VARCHAR(191) NOT NULL,
  `departmentId` VARCHAR(191) NOT NULL,
  `previousQuantity` DECIMAL(14,3) NOT NULL,
  `newQuantity` DECIMAL(14,3) NOT NULL,
  `reason` VARCHAR(191) NOT NULL,
  `userId` VARCHAR(191) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  INDEX `ProductStockAdjustment_productId_departmentId_createdAt_idx` (`productId`, `departmentId`, `createdAt`),
  CONSTRAINT `ProductStockAdjustment_productId_departmentId_fkey` FOREIGN KEY (`productId`, `departmentId`) REFERENCES `ProductInventory` (`productId`, `departmentId`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
