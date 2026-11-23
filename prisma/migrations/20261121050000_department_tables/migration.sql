ALTER TABLE `Department` ADD COLUMN `managesTables` BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE `DiningTable` (
    `id` VARCHAR(191) NOT NULL,
    `locationId` VARCHAR(191) NOT NULL,
    `departmentId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    UNIQUE INDEX `DiningTable_departmentId_name_key`(`departmentId`, `name`),
    INDEX `DiningTable_locationId_isActive_idx`(`locationId`, `isActive`),
    INDEX `DiningTable_departmentId_isActive_idx`(`departmentId`, `isActive`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `DiningTable` ADD CONSTRAINT `DiningTable_locationId_fkey` FOREIGN KEY (`locationId`) REFERENCES `Location`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `DiningTable` ADD CONSTRAINT `DiningTable_departmentId_locationId_fkey` FOREIGN KEY (`departmentId`, `locationId`) REFERENCES `Department`(`id`, `locationId`) ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO `PermissionGroup` (`id`, `name`, `code`, `description`, `createdAt`, `updatedAt`)
VALUES (UUID(), 'Tables', 'tables', 'View and manage service tables by department', CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3))
ON DUPLICATE KEY UPDATE `name` = VALUES(`name`), `description` = VALUES(`description`), `updatedAt` = CURRENT_TIMESTAMP(3);

INSERT INTO `Permission` (`id`, `code`, `name`, `permissionGroupId`, `createdAt`, `updatedAt`)
SELECT UUID(), 'tables:view', 'View Tables', pg.`id`, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3) FROM `PermissionGroup` pg WHERE pg.`code` = 'tables'
ON DUPLICATE KEY UPDATE `name` = VALUES(`name`), `permissionGroupId` = VALUES(`permissionGroupId`), `updatedAt` = CURRENT_TIMESTAMP(3);

INSERT INTO `Permission` (`id`, `code`, `name`, `permissionGroupId`, `createdAt`, `updatedAt`)
SELECT UUID(), 'tables:manage', 'Manage Tables', pg.`id`, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3) FROM `PermissionGroup` pg WHERE pg.`code` = 'tables'
ON DUPLICATE KEY UPDATE `name` = VALUES(`name`), `permissionGroupId` = VALUES(`permissionGroupId`), `updatedAt` = CURRENT_TIMESTAMP(3);
