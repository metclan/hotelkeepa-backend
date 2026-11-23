CREATE TABLE `ProductCategory` (
    `id` VARCHAR(191) NOT NULL,
    `locationId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,

    UNIQUE INDEX `ProductCategory_locationId_name_key`(`locationId`, `name`),
    UNIQUE INDEX `ProductCategory_id_locationId_key`(`id`, `locationId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `ProductUnit` (
    `id` VARCHAR(191) NOT NULL,
    `locationId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `symbol` VARCHAR(30) NOT NULL,

    UNIQUE INDEX `ProductUnit_locationId_name_key`(`locationId`, `name`),
    UNIQUE INDEX `ProductUnit_id_locationId_key`(`id`, `locationId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `Product` (
    `id` VARCHAR(191) NOT NULL,
    `locationId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `sku` VARCHAR(191) NULL,
    `categoryId` VARCHAR(191) NULL,
    `unitId` VARCHAR(191) NOT NULL,
    `costPrice` DECIMAL(14, 2) NOT NULL,
    `reorderQuantity` DECIMAL(14, 3) NOT NULL,

    UNIQUE INDEX `Product_locationId_sku_key`(`locationId`, `sku`),
    UNIQUE INDEX `Product_id_locationId_key`(`id`, `locationId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `ProductInventory` (
    `productId` VARCHAR(191) NOT NULL,
    `departmentId` VARCHAR(191) NOT NULL,
    `locationId` VARCHAR(191) NOT NULL,
    `costPrice` DECIMAL(14, 2) NOT NULL,
    `sellingPrice` DECIMAL(14, 2) NULL,
    `quantity` DECIMAL(14, 3) NOT NULL,
    `stockDate` DATE NOT NULL,
    `expiryDate` DATE NULL,

    PRIMARY KEY (`productId`, `departmentId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `ProductCategory` ADD CONSTRAINT `ProductCategory_locationId_fkey` FOREIGN KEY (`locationId`) REFERENCES `Location`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `ProductUnit` ADD CONSTRAINT `ProductUnit_locationId_fkey` FOREIGN KEY (`locationId`) REFERENCES `Location`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `Product` ADD CONSTRAINT `Product_locationId_fkey` FOREIGN KEY (`locationId`) REFERENCES `Location`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `Product` ADD CONSTRAINT `Product_categoryId_locationId_fkey` FOREIGN KEY (`categoryId`, `locationId`) REFERENCES `ProductCategory`(`id`, `locationId`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `Product` ADD CONSTRAINT `Product_unitId_locationId_fkey` FOREIGN KEY (`unitId`, `locationId`) REFERENCES `ProductUnit`(`id`, `locationId`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `ProductInventory` ADD CONSTRAINT `ProductInventory_productId_locationId_fkey` FOREIGN KEY (`productId`, `locationId`) REFERENCES `Product`(`id`, `locationId`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `ProductInventory` ADD CONSTRAINT `ProductInventory_departmentId_locationId_fkey` FOREIGN KEY (`departmentId`, `locationId`) REFERENCES `Department`(`id`, `locationId`) ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO `PermissionGroup` (`id`, `name`, `code`, `description`, `createdAt`, `updatedAt`) VALUES (UUID(), 'Products', 'products', 'Manage the hotel product catalog and inventory', NOW(3), NOW(3)) ON DUPLICATE KEY UPDATE `code` = 'products';
INSERT INTO `Permission` (`id`, `code`, `name`, `permissionGroupId`, `createdAt`, `updatedAt`)
SELECT UUID(), p.code, p.name, g.id, NOW(3), NOW(3) FROM `PermissionGroup` g CROSS JOIN
(SELECT 'products:view' AS code, 'View Products' AS name UNION ALL SELECT 'products:manage', 'Manage Products') p
WHERE g.code = 'products' ON DUPLICATE KEY UPDATE `updatedAt` = NOW(3);
