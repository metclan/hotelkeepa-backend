-- AlterTable
ALTER TABLE `session` ADD COLUMN `activeLocationId` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `UserLocation` ADD COLUMN `roleId` VARCHAR(191) NULL;

-- CreateIndex
CREATE UNIQUE INDEX `Role_id_locationId_key` ON `Role`(`id`, `locationId`);

-- AddForeignKey
ALTER TABLE `session` ADD CONSTRAINT `session_activeLocationId_fkey` FOREIGN KEY (`activeLocationId`) REFERENCES `Location`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `UserLocation` ADD CONSTRAINT `UserLocation_roleId_locationId_fkey` FOREIGN KEY (`roleId`, `locationId`) REFERENCES `Role`(`id`, `locationId`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- Preserve each existing user's role at their default hotel.
UPDATE `UserLocation` m
INNER JOIN `user` u ON u.`id` = m.`userId` AND u.`locationId` = m.`locationId`
INNER JOIN `Role` r ON r.`id` = u.`roleId` AND r.`locationId` = m.`locationId`
SET m.`roleId` = r.`id`;

-- Management permissions are also in the idempotent Prisma seed catalogue.
INSERT INTO `PermissionGroup` (`id`, `name`, `code`, `description`, `createdAt`, `updatedAt`)
VALUES (UUID(), 'Hotel Departments', 'departments', 'Manage departments in the selected hotel', CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
       (UUID(), 'Hotel Locations', 'locations', 'Create hotel branches', CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3))
ON DUPLICATE KEY UPDATE `description` = VALUES(`description`);

INSERT INTO `Permission` (`id`, `code`, `name`, `permissionGroupId`, `createdAt`, `updatedAt`)
SELECT UUID(), 'departments:manage', 'Manage Departments', `id`, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)
FROM `PermissionGroup` WHERE `code` = 'departments'
ON DUPLICATE KEY UPDATE `name` = VALUES(`name`);

INSERT INTO `Permission` (`id`, `code`, `name`, `permissionGroupId`, `createdAt`, `updatedAt`)
SELECT UUID(), 'locations:create', 'Create Hotel Locations', `id`, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)
FROM `PermissionGroup` WHERE `code` = 'locations'
ON DUPLICATE KEY UPDATE `name` = VALUES(`name`);
