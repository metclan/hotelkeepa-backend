-- AlterTable
ALTER TABLE `Location` ADD COLUMN `logo` MEDIUMTEXT NULL,
    ADD COLUMN `timezone` VARCHAR(191) NOT NULL DEFAULT 'Africa/Lagos';
