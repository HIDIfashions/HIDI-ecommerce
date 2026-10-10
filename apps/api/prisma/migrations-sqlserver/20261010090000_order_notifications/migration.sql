-- Additive infrastructure only. Existing order, payment, wallet and inventory tables are unchanged.
CREATE TABLE [dbo].[OrderNotificationOutbox] (
    [id] NVARCHAR(64) NOT NULL CONSTRAINT [OrderNotificationOutbox_pkey] PRIMARY KEY,
    [orderId] NVARCHAR(64) NOT NULL,
    [channel] NVARCHAR(40) NOT NULL,
    [status] NVARCHAR(40) NOT NULL CONSTRAINT [OrderNotificationOutbox_status_default] DEFAULT 'PENDING',
    [provider] NVARCHAR(40) NULL,
    [payload] NVARCHAR(MAX) NULL,
    [attempts] INT NOT NULL CONSTRAINT [OrderNotificationOutbox_attempts_default] DEFAULT 0,
    [dueAt] DATETIME2 NOT NULL CONSTRAINT [OrderNotificationOutbox_dueAt_default] DEFAULT SYSUTCDATETIME(),
    [firstAttemptAt] DATETIME2 NULL,
    [sentAt] DATETIME2 NULL,
    [providerMessageId] NVARCHAR(191) NULL,
    [lastError] NVARCHAR(191) NULL,
    [leaseOwner] NVARCHAR(64) NULL,
    [leaseUntil] DATETIME2 NULL,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [OrderNotificationOutbox_createdAt_default] DEFAULT SYSUTCDATETIME(),
    [updatedAt] DATETIME2 NOT NULL CONSTRAINT [OrderNotificationOutbox_updatedAt_default] DEFAULT SYSUTCDATETIME(),
    CONSTRAINT [OrderNotificationOutbox_orderId_fkey] FOREIGN KEY ([orderId]) REFERENCES [dbo].[Order]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION,
    CONSTRAINT [OrderNotificationOutbox_channel_check] CHECK ([channel] IN ('EMAIL','WHATSAPP')),
    CONSTRAINT [OrderNotificationOutbox_status_check] CHECK ([status] IN ('PENDING','WAITING_CONFIG','RETRY','PROCESSING','SENDING','SENT','FAILED','UNKNOWN','SKIPPED'))
);
CREATE UNIQUE INDEX [OrderNotificationOutbox_orderId_channel_key] ON [dbo].[OrderNotificationOutbox]([orderId],[channel]);
CREATE INDEX [OrderNotificationOutbox_status_dueAt_idx] ON [dbo].[OrderNotificationOutbox]([status],[dueAt]);
