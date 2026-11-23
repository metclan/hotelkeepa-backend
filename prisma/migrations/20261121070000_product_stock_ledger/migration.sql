ALTER TABLE `Product` ADD COLUMN `businessId` VARCHAR(191) NULL, ADD COLUMN `disabledAt` DATETIME(3) NULL, ADD COLUMN `archivedSku` VARCHAR(191) NULL;
UPDATE `Product` p JOIN `Location` l ON p.locationId = l.id SET p.businessId = l.businessId;
CREATE INDEX `Product_locationId_disabledAt_idx` ON `Product` (`locationId`, `disabledAt`);
ALTER TABLE `Product` MODIFY `businessId` VARCHAR(191) NOT NULL, ADD UNIQUE INDEX `Product_businessId_sku_key` (`businessId`, `sku`), DROP INDEX `Product_locationId_sku_key`;

CREATE TABLE `ProductImage` (
    `id` VARCHAR(191) NOT NULL,
    `productId` VARCHAR(191) NOT NULL,
    `key` VARCHAR(1024) NOT NULL,
    `url` TEXT NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `StockBatch` (
    `id` VARCHAR(191) NOT NULL,
    `productId` VARCHAR(191) NOT NULL,
    `departmentId` VARCHAR(191) NOT NULL,
    `quantity` DECIMAL(14, 3) NOT NULL,
    `quantityLeft` DECIMAL(14, 3) NOT NULL,
    `costPrice` DECIMAL(14, 2) NOT NULL,
    `stockDate` DATE NOT NULL,
    `expiryDate` DATE NULL,

    INDEX `StockBatch_productId_departmentId_stockDate_idx`(`productId`, `departmentId`, `stockDate`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `StockMovement` (
    `id` VARCHAR(191) NOT NULL,
    `stockBatchId` VARCHAR(191) NOT NULL,
    `type` ENUM('opening', 'adjustment', 'transfer', 'purchase') NOT NULL,
    `quantity` DECIMAL(14, 3) NOT NULL,
    `unitCost` DECIMAL(14, 2) NOT NULL,
    `referenceId` VARCHAR(191) NOT NULL,
    `reason` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NULL,
    `effectiveDate` DATE NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `StockMovement_referenceId_idx`(`referenceId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `ProductImage` ADD CONSTRAINT `ProductImage_productId_fkey` FOREIGN KEY (`productId`) REFERENCES `Product`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `StockBatch` ADD CONSTRAINT `StockBatch_productId_departmentId_fkey` FOREIGN KEY (`productId`, `departmentId`) REFERENCES `ProductInventory`(`productId`, `departmentId`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `StockMovement` ADD CONSTRAINT `StockMovement_stockBatchId_fkey` FOREIGN KEY (`stockBatchId`) REFERENCES `StockBatch`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO `StockBatch` (id, productId, departmentId, quantity, quantityLeft, costPrice, stockDate, expiryDate)
SELECT UUID(), productId, departmentId, quantity, quantity, costPrice, stockDate, expiryDate FROM `ProductInventory` WHERE quantity > 0;
INSERT INTO `StockMovement` (id, stockBatchId, type, quantity, unitCost, referenceId, reason, effectiveDate)
SELECT UUID(), id, 'opening', quantity, costPrice, id, 'Migrated opening inventory', stockDate FROM `StockBatch`;
