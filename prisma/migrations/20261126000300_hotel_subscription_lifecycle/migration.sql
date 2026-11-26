ALTER TABLE `Location`
    ADD COLUMN `trialEndsAt` DATETIME(3) NULL,
    ADD COLUMN `lastActivityAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    ADD COLUMN `deletionNoticeAt` DATETIME(3) NULL,
    ADD INDEX `Location_lastActivityAt_idx` (`lastActivityAt`);
