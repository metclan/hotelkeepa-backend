ALTER TABLE `user`
    ADD COLUMN `verificationEmailWindowStart` DATETIME(3) NULL,
    ADD COLUMN `verificationEmailLastSentAt` DATETIME(3) NULL,
    ADD COLUMN `verificationEmailsSent` INTEGER NOT NULL DEFAULT 0;
