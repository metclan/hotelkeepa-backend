-- AlterTable
ALTER TABLE `Location` ADD COLUMN `setupPreset` ENUM('reservations_only', 'reservations_bar', 'full_service') NOT NULL DEFAULT 'reservations_only';

-- CreateTable
CREATE TABLE `UserLocation` (
    `userId` VARCHAR(191) NOT NULL,
    `locationId` VARCHAR(191) NOT NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `allDepartments` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `UserLocation_locationId_idx`(`locationId`),
    PRIMARY KEY (`userId`, `locationId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Department` (
    `id` VARCHAR(191) NOT NULL,
    `locationId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `holdsInventory` BOOLEAN NOT NULL DEFAULT false,
    `canSell` BOOLEAN NOT NULL DEFAULT false,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `disabledAt` DATETIME(3) NULL,
    `invoiceHeading` VARCHAR(191) NULL,
    `invoicePrefix` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Department_locationId_isActive_idx`(`locationId`, `isActive`),
    UNIQUE INDEX `Department_locationId_name_key`(`locationId`, `name`),
    UNIQUE INDEX `Department_id_locationId_key`(`id`, `locationId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `UserDepartment` (
    `userId` VARCHAR(191) NOT NULL,
    `locationId` VARCHAR(191) NOT NULL,
    `departmentId` VARCHAR(191) NOT NULL,
    `role` ENUM('staff', 'manager') NOT NULL DEFAULT 'staff',
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `UserDepartment_userId_locationId_idx`(`userId`, `locationId`),
    INDEX `UserDepartment_departmentId_locationId_idx`(`departmentId`, `locationId`),
    PRIMARY KEY (`userId`, `departmentId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `UserLocation` ADD CONSTRAINT `UserLocation_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `UserLocation` ADD CONSTRAINT `UserLocation_locationId_fkey` FOREIGN KEY (`locationId`) REFERENCES `Location`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Department` ADD CONSTRAINT `Department_locationId_fkey` FOREIGN KEY (`locationId`) REFERENCES `Location`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `UserDepartment` ADD CONSTRAINT `UserDepartment_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `UserDepartment` ADD CONSTRAINT `UserDepartment_userId_locationId_fkey` FOREIGN KEY (`userId`, `locationId`) REFERENCES `UserLocation`(`userId`, `locationId`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `UserDepartment` ADD CONSTRAINT `UserDepartment_departmentId_locationId_fkey` FOREIGN KEY (`departmentId`, `locationId`) REFERENCES `Department`(`id`, `locationId`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- Preserve existing hotel access; only owners start with access to all departments.
INSERT INTO `UserLocation` (`userId`, `locationId`, `isActive`, `allDepartments`, `createdAt`, `updatedAt`)
SELECT u.`id`, u.`locationId`, u.`isActive`, u.`isOwner`, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)
FROM `user` u
INNER JOIN `Location` l ON l.`id` = u.`locationId` AND l.`businessId` = u.`businessId`;
