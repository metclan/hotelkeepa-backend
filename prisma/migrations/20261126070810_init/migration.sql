-- CreateTable
CREATE TABLE `user` (
    `id` VARCHAR(191) NOT NULL,
    `name` TEXT NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `emailVerified` BOOLEAN NOT NULL DEFAULT false,
    `verificationEmailWindowStart` DATETIME(3) NULL,
    `verificationEmailLastSentAt` DATETIME(3) NULL,
    `verificationEmailsSent` INTEGER NOT NULL DEFAULT 0,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `onboardingStage` INTEGER NOT NULL DEFAULT 1,
    `isOwner` BOOLEAN NOT NULL DEFAULT false,
    `phone` VARCHAR(191) NULL,
    `roleId` VARCHAR(191) NULL,
    `locationId` VARCHAR(191) NULL,
    `businessId` VARCHAR(191) NULL,
    `image` TEXT NULL,

    UNIQUE INDEX `user_email_key`(`email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Business` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NULL,
    `currencyId` VARCHAR(191) NULL,
    `countryId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Role` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `isAdmin` BOOLEAN NOT NULL DEFAULT false,
    `locationId` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Role_id_locationId_key`(`id`, `locationId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PermissionGroup` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `code` VARCHAR(191) NOT NULL,
    `description` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `PermissionGroup_code_key`(`code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Permission` (
    `id` VARCHAR(191) NOT NULL,
    `code` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `permissionGroupId` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Permission_code_key`(`code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `RolePermission` (
    `id` VARCHAR(191) NOT NULL,
    `roleId` VARCHAR(191) NOT NULL,
    `permissionId` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `RolePermission_roleId_permissionId_key`(`roleId`, `permissionId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Location` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NULL,
    `address` VARCHAR(191) NULL,
    `city` VARCHAR(191) NULL,
    `state` VARCHAR(191) NULL,
    `zip` VARCHAR(191) NULL,
    `phone` VARCHAR(191) NULL,
    `email` VARCHAR(191) NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `isDeleted` BOOLEAN NOT NULL DEFAULT false,
    `businessId` VARCHAR(191) NOT NULL,
    `timezone` VARCHAR(191) NOT NULL DEFAULT 'Africa/Lagos',
    `logo` MEDIUMTEXT NULL,
    `logoKey` VARCHAR(1024) NULL,
    `trialEndsAt` DATETIME(3) NULL,
    `lastActivityAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `deletionNoticeAt` DATETIME(3) NULL,
    `setupPreset` ENUM('reservations_only', 'reservations_bar', 'full_service') NOT NULL DEFAULT 'reservations_only',
    `defaultCheckoutTime` VARCHAR(191) NOT NULL DEFAULT '12:00',
    `defaultCheckinTime` VARCHAR(191) NOT NULL DEFAULT '12:00',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Location_lastActivityAt_idx`(`lastActivityAt`),
    UNIQUE INDEX `Location_businessId_name_key`(`businessId`, `name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `CustomLabels` (
    `id` VARCHAR(191) NOT NULL,
    `locationId` VARCHAR(191) NOT NULL,
    `label` VARCHAR(255) NOT NULL,
    `type` ENUM('payment') NOT NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Room` (
    `id` VARCHAR(191) NOT NULL,
    `roomNumber` VARCHAR(191) NOT NULL,
    `roomTypeId` VARCHAR(191) NOT NULL,
    `floor` VARCHAR(191) NULL,
    `locationId` VARCHAR(191) NOT NULL,
    `status` ENUM('available', 'occupied', 'reserved', 'maintenance') NOT NULL DEFAULT 'available',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Room_locationId_roomNumber_key`(`locationId`, `roomNumber`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `RoomType` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `locationId` VARCHAR(191) NOT NULL,
    `pricePerNight` DECIMAL(10, 2) NOT NULL,
    `description` VARCHAR(191) NULL,
    `maxAdults` INTEGER NULL,
    `maxChildren` INTEGER NULL,
    `maxOccupancy` INTEGER NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Customer` (
    `id` VARCHAR(191) NOT NULL,
    `firstName` VARCHAR(191) NOT NULL,
    `lastName` VARCHAR(191) NULL,
    `phone` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NULL,
    `locationId` VARCHAR(191) NOT NULL,
    `businessId` VARCHAR(191) NOT NULL,
    `address` VARCHAR(191) NULL,
    `gender` ENUM('male', 'female', 'other') NULL,
    `idType` VARCHAR(191) NULL,
    `idNumber` VARCHAR(191) NULL,
    `nationality` VARCHAR(191) NULL,
    `occupation` VARCHAR(191) NULL,
    `dateOfBirth` DATETIME(3) NULL,
    `isWalking` BOOLEAN NOT NULL DEFAULT false,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `isDeleted` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Reservation` (
    `id` VARCHAR(191) NOT NULL,
    `customerId` VARCHAR(191) NOT NULL,
    `locationId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `reservationDate` DATETIME(3) NOT NULL,
    `arrivalDate` DATETIME(3) NOT NULL,
    `departureDate` DATETIME(3) NOT NULL,
    `totalAmount` DECIMAL(10, 2) NOT NULL,
    `bookingNumber` VARCHAR(191) NULL,
    `paymentStatus` ENUM('paid', 'partially_paid', 'due') NOT NULL,
    `notes` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ReservationLine` (
    `id` VARCHAR(191) NOT NULL,
    `reservationId` VARCHAR(191) NOT NULL,
    `roomId` VARCHAR(191) NOT NULL,
    `checkInDate` DATETIME(3) NULL,
    `checkOutDate` DATETIME(3) NULL,
    `numberOfAdults` INTEGER NULL,
    `numberOfChildren` INTEGER NULL,
    `pricePerNight` DECIMAL(10, 2) NOT NULL,
    `status` ENUM('reserved', 'checked_in', 'checked_out', 'cancelled', 'no_show') NULL DEFAULT 'reserved',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Payment` (
    `id` VARCHAR(191) NOT NULL,
    `locationId` VARCHAR(191) NOT NULL,
    `contactType` ENUM('customer', 'supplier') NOT NULL,
    `contactId` VARCHAR(191) NULL,
    `direction` ENUM('outgoing', 'ingoing') NOT NULL,
    `amount` DECIMAL(10, 2) NOT NULL,
    `paymentDate` DATETIME(3) NOT NULL,
    `reference` VARCHAR(191) NULL,
    `notes` VARCHAR(191) NULL,
    `createdById` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PaymentMethodEntry` (
    `id` VARCHAR(191) NOT NULL,
    `paymentId` VARCHAR(191) NOT NULL,
    `paymentMethodId` VARCHAR(191) NOT NULL,
    `amount` DECIMAL(10, 2) NOT NULL,

    UNIQUE INDEX `PaymentMethodEntry_paymentId_paymentMethodId_key`(`paymentId`, `paymentMethodId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PaymentAllocation` (
    `id` VARCHAR(191) NOT NULL,
    `paymentId` VARCHAR(191) NOT NULL,
    `transactionType` ENUM('reservation', 'sale', 'purchase', 'payment') NOT NULL,
    `transactionId` VARCHAR(191) NULL,
    `amountApplied` DECIMAL(10, 2) NOT NULL,
    `allocationType` ENUM('reservation', 'sale', 'purchase') NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `DocumentSequence` (
    `id` VARCHAR(191) NOT NULL,
    `locationId` VARCHAR(191) NOT NULL,
    `transactionType` ENUM('reservation', 'sale', 'stock_adjustment', 'payment') NOT NULL,
    `currentNumber` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `DocumentSequence_locationId_transactionType_key`(`locationId`, `transactionType`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Plan` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `price` DOUBLE NOT NULL,
    `maxUsers` INTEGER NULL,
    `maxLocations` INTEGER NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Subscription` (
    `id` VARCHAR(191) NOT NULL,
    `businessId` VARCHAR(191) NOT NULL,
    `planId` VARCHAR(191) NOT NULL,
    `startDate` DATETIME(3) NOT NULL,
    `endDate` DATETIME(3) NULL,
    `renewalReminderAt` DATETIME(3) NULL,
    `locationId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `SubscriptionPayment` (
    `id` VARCHAR(191) NOT NULL,
    `subscriptionId` VARCHAR(191) NOT NULL,
    `amount` INTEGER NOT NULL,
    `currency` CHAR(3) NULL,
    `paidAt` DATETIME(3) NOT NULL,
    `provider` VARCHAR(191) NULL,
    `providerReference` VARCHAR(191) NULL,
    `locationId` VARCHAR(191) NULL,
    `status` ENUM('PENDING', 'SUCCESS', 'FAILED', 'REFUNDED') NOT NULL DEFAULT 'PENDING',
    `businessId` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
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

    UNIQUE INDEX `SubscriptionCheckout_checkoutId_key`(`checkoutId`),
    INDEX `SubscriptionCheckout_locationId_closedAt_idx`(`locationId`, `closedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `session` (
    `id` VARCHAR(191) NOT NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `token` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `ipAddress` TEXT NULL,
    `userAgent` TEXT NULL,
    `activeLocationId` VARCHAR(191) NULL,
    `userId` VARCHAR(191) NOT NULL,

    INDEX `session_userId_idx`(`userId`(191)),
    UNIQUE INDEX `session_token_key`(`token`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `account` (
    `id` VARCHAR(191) NOT NULL,
    `accountId` TEXT NOT NULL,
    `providerId` TEXT NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `accessToken` TEXT NULL,
    `refreshToken` TEXT NULL,
    `idToken` TEXT NULL,
    `accessTokenExpiresAt` DATETIME(3) NULL,
    `refreshTokenExpiresAt` DATETIME(3) NULL,
    `scope` TEXT NULL,
    `password` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `account_userId_idx_new`(`userId`(191)),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `verification` (
    `id` VARCHAR(191) NOT NULL,
    `identifier` TEXT NOT NULL,
    `value` TEXT NOT NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `verification_identifier_idx`(`identifier`(191)),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Country` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `code` VARCHAR(191) NOT NULL,
    `phoneCode` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Country_name_key`(`name`),
    UNIQUE INDEX `Country_code_key`(`code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Currency` (
    `id` VARCHAR(191) NOT NULL,
    `code` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `symbol` VARCHAR(191) NOT NULL,
    `countryId` VARCHAR(191) NULL,
    `shortForm` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Currency_code_key`(`code`),
    UNIQUE INDEX `Currency_countryId_key`(`countryId`),
    UNIQUE INDEX `Currency_shortForm_key`(`shortForm`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Invitation` (
    `id` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `token` VARCHAR(191) NOT NULL,
    `roleId` VARCHAR(191) NOT NULL,
    `locationId` VARCHAR(191) NOT NULL,
    `businessId` VARCHAR(191) NOT NULL,
    `invitedById` VARCHAR(191) NOT NULL,
    `status` ENUM('pending', 'accepted', 'expired', 'revoked') NOT NULL DEFAULT 'pending',
    `expiresAt` DATETIME(3) NOT NULL,
    `acceptedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Invitation_token_key`(`token`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `UserLocation` (
    `userId` VARCHAR(191) NOT NULL,
    `locationId` VARCHAR(191) NOT NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `allDepartments` BOOLEAN NOT NULL DEFAULT false,
    `roleId` VARCHAR(191) NULL,
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
    `managesTables` BOOLEAN NOT NULL DEFAULT false,
    `kitchenOrders` BOOLEAN NOT NULL DEFAULT false,
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
CREATE TABLE `DiningTable` (
    `id` VARCHAR(191) NOT NULL,
    `locationId` VARCHAR(191) NOT NULL,
    `departmentId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `DiningTable_locationId_isActive_idx`(`locationId`, `isActive`),
    INDEX `DiningTable_departmentId_isActive_idx`(`departmentId`, `isActive`),
    UNIQUE INDEX `DiningTable_departmentId_name_key`(`departmentId`, `name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ProductCategory` (
    `id` VARCHAR(191) NOT NULL,
    `locationId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,

    UNIQUE INDEX `ProductCategory_locationId_name_key`(`locationId`, `name`),
    UNIQUE INDEX `ProductCategory_id_locationId_key`(`id`, `locationId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ProductUnit` (
    `id` VARCHAR(191) NOT NULL,
    `locationId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `symbol` VARCHAR(30) NOT NULL,

    UNIQUE INDEX `ProductUnit_locationId_name_key`(`locationId`, `name`),
    UNIQUE INDEX `ProductUnit_id_locationId_key`(`id`, `locationId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Product` (
    `id` VARCHAR(191) NOT NULL,
    `locationId` VARCHAR(191) NOT NULL,
    `businessId` VARCHAR(191) NOT NULL,
    `disabledAt` DATETIME(3) NULL,
    `archivedSku` VARCHAR(191) NULL,
    `name` VARCHAR(191) NOT NULL,
    `sku` VARCHAR(191) NULL,
    `categoryId` VARCHAR(191) NULL,
    `unitId` VARCHAR(191) NOT NULL,
    `costPrice` DECIMAL(14, 2) NOT NULL,
    `reorderQuantity` DECIMAL(14, 3) NOT NULL,

    INDEX `Product_locationId_disabledAt_idx`(`locationId`, `disabledAt`),
    UNIQUE INDEX `Product_businessId_sku_key`(`businessId`, `sku`),
    UNIQUE INDEX `Product_id_locationId_key`(`id`, `locationId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
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

-- CreateTable
CREATE TABLE `ProductImage` (
    `id` VARCHAR(191) NOT NULL,
    `productId` VARCHAR(191) NOT NULL,
    `key` VARCHAR(1024) NOT NULL,
    `url` TEXT NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
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

-- CreateTable
CREATE TABLE `StockMovement` (
    `id` VARCHAR(191) NOT NULL,
    `stockBatchId` VARCHAR(191) NOT NULL,
    `type` ENUM('opening', 'adjustment', 'transfer', 'purchase', 'sale', 'adjustment_edited', 'adjustment_deleted') NOT NULL,
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

-- CreateTable
CREATE TABLE `ProductStockAdjustment` (
    `id` VARCHAR(191) NOT NULL,
    `memoId` VARCHAR(191) NOT NULL,
    `productId` VARCHAR(191) NOT NULL,
    `departmentId` VARCHAR(191) NOT NULL,
    `previousQuantity` DECIMAL(14, 3) NOT NULL,
    `newQuantity` DECIMAL(14, 3) NOT NULL,
    `reason` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `ProductStockAdjustment_productId_departmentId_createdAt_idx`(`productId`, `departmentId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `StockAdjustmentMemo` (
    `id` VARCHAR(191) NOT NULL,
    `memoNumber` VARCHAR(191) NOT NULL,
    `deletedAt` DATETIME(3) NULL,
    `effectiveDate` DATE NOT NULL,
    `note` TEXT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PosRegister` (
    `id` VARCHAR(191) NOT NULL,
    `number` INTEGER NOT NULL AUTO_INCREMENT,
    `locationId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `activeKey` VARCHAR(191) NULL,
    `openedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `closedAt` DATETIME(3) NULL,

    UNIQUE INDEX `PosRegister_number_key`(`number`),
    UNIQUE INDEX `PosRegister_activeKey_key`(`activeKey`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PosOrder` (
    `id` VARCHAR(191) NOT NULL,
    `registerId` VARCHAR(191) NOT NULL,
    `departmentId` VARCHAR(191) NOT NULL,
    `tableId` VARCHAR(191) NULL,
    `activeTableId` VARCHAR(191) NULL,
    `status` ENUM('held', 'paid', 'cancelled') NOT NULL,
    `receiptNumber` VARCHAR(191) NULL,
    `paymentMethodId` VARCHAR(191) NULL,
    `changeDue` DECIMAL(14, 2) NOT NULL DEFAULT 0,
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

-- CreateTable
CREATE TABLE `PosOrderPayment` (
    `id` VARCHAR(191) NOT NULL,
    `orderId` VARCHAR(191) NOT NULL,
    `paymentMethodId` VARCHAR(191) NOT NULL,
    `amountReceived` DECIMAL(14, 2) NOT NULL,
    `amountApplied` DECIMAL(14, 2) NOT NULL,

    INDEX `PosOrderPayment_paymentMethodId_idx`(`paymentMethodId`),
    UNIQUE INDEX `PosOrderPayment_orderId_paymentMethodId_key`(`orderId`, `paymentMethodId`),
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
ALTER TABLE `user` ADD CONSTRAINT `user_roleId_fkey` FOREIGN KEY (`roleId`) REFERENCES `Role`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `user` ADD CONSTRAINT `user_locationId_fkey` FOREIGN KEY (`locationId`) REFERENCES `Location`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `user` ADD CONSTRAINT `user_businessId_fkey` FOREIGN KEY (`businessId`) REFERENCES `Business`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Business` ADD CONSTRAINT `Business_currencyId_fkey` FOREIGN KEY (`currencyId`) REFERENCES `Currency`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Business` ADD CONSTRAINT `Business_countryId_fkey` FOREIGN KEY (`countryId`) REFERENCES `Country`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Role` ADD CONSTRAINT `Role_locationId_fkey` FOREIGN KEY (`locationId`) REFERENCES `Location`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Permission` ADD CONSTRAINT `Permission_permissionGroupId_fkey` FOREIGN KEY (`permissionGroupId`) REFERENCES `PermissionGroup`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `RolePermission` ADD CONSTRAINT `RolePermission_roleId_fkey` FOREIGN KEY (`roleId`) REFERENCES `Role`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `RolePermission` ADD CONSTRAINT `RolePermission_permissionId_fkey` FOREIGN KEY (`permissionId`) REFERENCES `Permission`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Location` ADD CONSTRAINT `Location_businessId_fkey` FOREIGN KEY (`businessId`) REFERENCES `Business`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CustomLabels` ADD CONSTRAINT `CustomLabels_locationId_fkey` FOREIGN KEY (`locationId`) REFERENCES `Location`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Room` ADD CONSTRAINT `Room_roomTypeId_fkey` FOREIGN KEY (`roomTypeId`) REFERENCES `RoomType`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Room` ADD CONSTRAINT `Room_locationId_fkey` FOREIGN KEY (`locationId`) REFERENCES `Location`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `RoomType` ADD CONSTRAINT `RoomType_locationId_fkey` FOREIGN KEY (`locationId`) REFERENCES `Location`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Customer` ADD CONSTRAINT `Customer_locationId_fkey` FOREIGN KEY (`locationId`) REFERENCES `Location`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Customer` ADD CONSTRAINT `Customer_businessId_fkey` FOREIGN KEY (`businessId`) REFERENCES `Business`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Reservation` ADD CONSTRAINT `Reservation_locationId_fkey` FOREIGN KEY (`locationId`) REFERENCES `Location`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Reservation` ADD CONSTRAINT `Reservation_customerId_fkey` FOREIGN KEY (`customerId`) REFERENCES `Customer`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Reservation` ADD CONSTRAINT `Reservation_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ReservationLine` ADD CONSTRAINT `ReservationLine_roomId_fkey` FOREIGN KEY (`roomId`) REFERENCES `Room`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ReservationLine` ADD CONSTRAINT `ReservationLine_reservationId_fkey` FOREIGN KEY (`reservationId`) REFERENCES `Reservation`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Payment` ADD CONSTRAINT `Payment_locationId_fkey` FOREIGN KEY (`locationId`) REFERENCES `Location`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PaymentMethodEntry` ADD CONSTRAINT `PaymentMethodEntry_paymentId_fkey` FOREIGN KEY (`paymentId`) REFERENCES `Payment`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PaymentMethodEntry` ADD CONSTRAINT `PaymentMethodEntry_paymentMethodId_fkey` FOREIGN KEY (`paymentMethodId`) REFERENCES `CustomLabels`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PaymentAllocation` ADD CONSTRAINT `PaymentAllocation_paymentId_fkey` FOREIGN KEY (`paymentId`) REFERENCES `Payment`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `DocumentSequence` ADD CONSTRAINT `DocumentSequence_locationId_fkey` FOREIGN KEY (`locationId`) REFERENCES `Location`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Subscription` ADD CONSTRAINT `Subscription_businessId_fkey` FOREIGN KEY (`businessId`) REFERENCES `Business`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Subscription` ADD CONSTRAINT `Subscription_planId_fkey` FOREIGN KEY (`planId`) REFERENCES `Plan`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Subscription` ADD CONSTRAINT `Subscription_locationId_fkey` FOREIGN KEY (`locationId`) REFERENCES `Location`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SubscriptionPayment` ADD CONSTRAINT `SubscriptionPayment_subscriptionId_fkey` FOREIGN KEY (`subscriptionId`) REFERENCES `Subscription`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SubscriptionPayment` ADD CONSTRAINT `SubscriptionPayment_businessId_fkey` FOREIGN KEY (`businessId`) REFERENCES `Business`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SubscriptionPayment` ADD CONSTRAINT `SubscriptionPayment_locationId_fkey` FOREIGN KEY (`locationId`) REFERENCES `Location`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SubscriptionCheckout` ADD CONSTRAINT `SubscriptionCheckout_locationId_fkey` FOREIGN KEY (`locationId`) REFERENCES `Location`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `session` ADD CONSTRAINT `session_activeLocationId_fkey` FOREIGN KEY (`activeLocationId`) REFERENCES `Location`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `session` ADD CONSTRAINT `session_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `account` ADD CONSTRAINT `account_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Currency` ADD CONSTRAINT `Currency_countryId_fkey` FOREIGN KEY (`countryId`) REFERENCES `Country`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Invitation` ADD CONSTRAINT `Invitation_roleId_fkey` FOREIGN KEY (`roleId`) REFERENCES `Role`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Invitation` ADD CONSTRAINT `Invitation_locationId_fkey` FOREIGN KEY (`locationId`) REFERENCES `Location`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Invitation` ADD CONSTRAINT `Invitation_invitedById_fkey` FOREIGN KEY (`invitedById`) REFERENCES `user`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `UserLocation` ADD CONSTRAINT `UserLocation_roleId_locationId_fkey` FOREIGN KEY (`roleId`, `locationId`) REFERENCES `Role`(`id`, `locationId`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `UserLocation` ADD CONSTRAINT `UserLocation_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `UserLocation` ADD CONSTRAINT `UserLocation_locationId_fkey` FOREIGN KEY (`locationId`) REFERENCES `Location`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Department` ADD CONSTRAINT `Department_locationId_fkey` FOREIGN KEY (`locationId`) REFERENCES `Location`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `DiningTable` ADD CONSTRAINT `DiningTable_locationId_fkey` FOREIGN KEY (`locationId`) REFERENCES `Location`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `DiningTable` ADD CONSTRAINT `DiningTable_departmentId_locationId_fkey` FOREIGN KEY (`departmentId`, `locationId`) REFERENCES `Department`(`id`, `locationId`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProductCategory` ADD CONSTRAINT `ProductCategory_locationId_fkey` FOREIGN KEY (`locationId`) REFERENCES `Location`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProductUnit` ADD CONSTRAINT `ProductUnit_locationId_fkey` FOREIGN KEY (`locationId`) REFERENCES `Location`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Product` ADD CONSTRAINT `Product_locationId_fkey` FOREIGN KEY (`locationId`) REFERENCES `Location`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Product` ADD CONSTRAINT `Product_categoryId_locationId_fkey` FOREIGN KEY (`categoryId`, `locationId`) REFERENCES `ProductCategory`(`id`, `locationId`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Product` ADD CONSTRAINT `Product_unitId_locationId_fkey` FOREIGN KEY (`unitId`, `locationId`) REFERENCES `ProductUnit`(`id`, `locationId`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProductInventory` ADD CONSTRAINT `ProductInventory_productId_locationId_fkey` FOREIGN KEY (`productId`, `locationId`) REFERENCES `Product`(`id`, `locationId`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProductInventory` ADD CONSTRAINT `ProductInventory_departmentId_locationId_fkey` FOREIGN KEY (`departmentId`, `locationId`) REFERENCES `Department`(`id`, `locationId`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProductImage` ADD CONSTRAINT `ProductImage_productId_fkey` FOREIGN KEY (`productId`) REFERENCES `Product`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `StockBatch` ADD CONSTRAINT `StockBatch_productId_departmentId_fkey` FOREIGN KEY (`productId`, `departmentId`) REFERENCES `ProductInventory`(`productId`, `departmentId`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `StockMovement` ADD CONSTRAINT `StockMovement_stockBatchId_fkey` FOREIGN KEY (`stockBatchId`) REFERENCES `StockBatch`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProductStockAdjustment` ADD CONSTRAINT `ProductStockAdjustment_memoId_fkey` FOREIGN KEY (`memoId`) REFERENCES `StockAdjustmentMemo`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProductStockAdjustment` ADD CONSTRAINT `ProductStockAdjustment_productId_departmentId_fkey` FOREIGN KEY (`productId`, `departmentId`) REFERENCES `ProductInventory`(`productId`, `departmentId`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PosOrder` ADD CONSTRAINT `PosOrder_registerId_fkey` FOREIGN KEY (`registerId`) REFERENCES `PosRegister`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PosOrderPayment` ADD CONSTRAINT `PosOrderPayment_orderId_fkey` FOREIGN KEY (`orderId`) REFERENCES `PosOrder`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PosOrderPayment` ADD CONSTRAINT `PosOrderPayment_paymentMethodId_fkey` FOREIGN KEY (`paymentMethodId`) REFERENCES `CustomLabels`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `UserDepartment` ADD CONSTRAINT `UserDepartment_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `UserDepartment` ADD CONSTRAINT `UserDepartment_userId_locationId_fkey` FOREIGN KEY (`userId`, `locationId`) REFERENCES `UserLocation`(`userId`, `locationId`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `UserDepartment` ADD CONSTRAINT `UserDepartment_departmentId_locationId_fkey` FOREIGN KEY (`departmentId`, `locationId`) REFERENCES `Department`(`id`, `locationId`) ON DELETE RESTRICT ON UPDATE CASCADE;
