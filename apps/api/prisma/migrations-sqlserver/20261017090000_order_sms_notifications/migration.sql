-- Existing notification rows, indexes and financial/customer tables are preserved.
-- Run through the authorized private migration route after the original outbox migration.
SET XACT_ABORT ON;
BEGIN TRANSACTION;
IF OBJECT_ID(N'dbo.OrderNotificationOutbox', N'U') IS NULL
    THROW 51000, 'Apply the original order_notifications migration first.', 1;
ALTER TABLE [dbo].[OrderNotificationOutbox]
    DROP CONSTRAINT [OrderNotificationOutbox_channel_check];
ALTER TABLE [dbo].[OrderNotificationOutbox] WITH CHECK
    ADD CONSTRAINT [OrderNotificationOutbox_channel_check]
    CHECK ([channel] IN ('EMAIL','WHATSAPP','SMS'));
COMMIT TRANSACTION;
