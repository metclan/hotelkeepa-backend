ALTER TABLE `SubscriptionPayment` ADD COLUMN `currency` CHAR(3) NULL;

CREATE TABLE `SubscriptionCheckout` (
    `id` VARCHAR(191) NOT NULL,
    `locationId` VARCHAR(191) NOT NULL,
    `planKey` VARCHAR(191) NOT NULL,
    `amount` INTEGER NOT NULL,
    `currency` CHAR(3) NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `checkoutId` VARCHAR(191) NULL,
    `checkoutUrl` TEXT NULL,
    `closedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`),
    UNIQUE INDEX `SubscriptionCheckout_checkoutId_key`(`checkoutId`),
    INDEX `SubscriptionCheckout_locationId_closedAt_idx`(`locationId`, `closedAt`),
    CONSTRAINT `SubscriptionCheckout_locationId_fkey` FOREIGN KEY (`locationId`) REFERENCES `Location`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

UPDATE `user` AS u
JOIN `Invitation` AS i ON i.email = u.email AND i.businessId = u.businessId
SET u.emailVerified = TRUE
WHERE u.isOwner = FALSE AND i.status = 'accepted';
