ALTER TABLE `Department` ADD COLUMN `kitchenOrders` BOOLEAN NOT NULL DEFAULT false;
UPDATE `Department` SET `kitchenOrders` = true WHERE LOWER(`name`) LIKE '%restaurant%' AND `canSell` = true;

CREATE TABLE `PosRegister` (
    `id` VARCHAR(191) NOT NULL,
    `number` INTEGER NOT NULL AUTO_INCREMENT,
    `locationId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `activeKey` VARCHAR(191) NULL,
    `openedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `closedAt` DATETIME(3) NULL,

    UNIQUE INDEX `PosRegister_activeKey_key`(`activeKey`),
    UNIQUE INDEX `PosRegister_number_key`(`number`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `PosOrder` (
    `id` VARCHAR(191) NOT NULL,
    `registerId` VARCHAR(191) NOT NULL,
    `departmentId` VARCHAR(191) NOT NULL,
    `tableId` VARCHAR(191) NULL,
    `activeTableId` VARCHAR(191) NULL,
    `status` ENUM('held', 'paid') NOT NULL,
    `receiptNumber` VARCHAR(191) NULL,
    `paymentMethodId` VARCHAR(191) NULL,
    `customerId` VARCHAR(191) NULL,
    `customerName` VARCHAR(191) NULL,
    `items` JSON NOT NULL,
    `total` DECIMAL(14, 2) NOT NULL,
    `kitchenVersion` INTEGER NOT NULL DEFAULT 0,
    `version` INTEGER NOT NULL DEFAULT 1,
    `kitchenItems` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `PosOrder_activeTableId_key`(`activeTableId`),
    INDEX `PosOrder_departmentId_status_updatedAt_idx`(`departmentId`, `status`, `updatedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `PosOrder` ADD CONSTRAINT `PosOrder_registerId_fkey` FOREIGN KEY (`registerId`) REFERENCES `PosRegister`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO `PermissionGroup` (id, name, code, description, createdAt, updatedAt) VALUES (UUID(), 'Point of Sale', 'pos', 'Operate the sales register', NOW(3), NOW(3)) ON DUPLICATE KEY UPDATE code = 'pos';
INSERT INTO `Permission` (id, code, name, permissionGroupId, createdAt, updatedAt)
SELECT UUID(), 'sales:pos', 'Use Point of Sale', id, NOW(3), NOW(3) FROM `PermissionGroup` WHERE code = 'pos' ON DUPLICATE KEY UPDATE updatedAt = NOW(3);
