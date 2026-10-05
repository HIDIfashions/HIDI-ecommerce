CREATE TABLE [CustomerAuthOtp] (
    [id] NVARCHAR(64) COLLATE Latin1_General_100_BIN2 NOT NULL,
    [phone] NVARCHAR(191) COLLATE Latin1_General_100_BIN2 NOT NULL,
    [codeHash] NVARCHAR(128) COLLATE Latin1_General_100_BIN2 NOT NULL,
    [purpose] NVARCHAR(40) COLLATE Latin1_General_100_BIN2 NOT NULL CONSTRAINT [CustomerAuthOtp_purpose_df] DEFAULT 'SIGN_IN',
    [channel] NVARCHAR(40) COLLATE Latin1_General_100_BIN2 NOT NULL CONSTRAINT [CustomerAuthOtp_channel_df] DEFAULT 'WHATSAPP',
    [attempts] INT NOT NULL CONSTRAINT [CustomerAuthOtp_attempts_df] DEFAULT 0,
    [expiresAt] DATETIME2 NOT NULL,
    [consumedAt] DATETIME2,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [CustomerAuthOtp_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [CustomerAuthOtp_pkey] PRIMARY KEY CLUSTERED ([id])
);

CREATE TABLE [CustomerAuthSession] (
    [id] NVARCHAR(64) COLLATE Latin1_General_100_BIN2 NOT NULL,
    [userId] NVARCHAR(64) COLLATE Latin1_General_100_BIN2 NOT NULL,
    [authSubject] NVARCHAR(191) COLLATE Latin1_General_100_BIN2 NOT NULL,
    [tokenHash] NVARCHAR(128) COLLATE Latin1_General_100_BIN2 NOT NULL,
    [expiresAt] DATETIME2 NOT NULL,
    [revokedAt] DATETIME2,
    [lastUsedAt] DATETIME2,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [CustomerAuthSession_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [CustomerAuthSession_pkey] PRIMARY KEY CLUSTERED ([id])
);

CREATE NONCLUSTERED INDEX [CustomerAuthOtp_phone_purpose_expiresAt_idx] ON [CustomerAuthOtp]([phone], [purpose], [expiresAt]);
CREATE NONCLUSTERED INDEX [CustomerAuthOtp_expiresAt_consumedAt_idx] ON [CustomerAuthOtp]([expiresAt], [consumedAt]);
CREATE UNIQUE NONCLUSTERED INDEX [CustomerAuthSession_tokenHash_key] ON [CustomerAuthSession]([tokenHash]);
CREATE NONCLUSTERED INDEX [CustomerAuthSession_userId_expiresAt_idx] ON [CustomerAuthSession]([userId], [expiresAt]);
CREATE NONCLUSTERED INDEX [CustomerAuthSession_authSubject_idx] ON [CustomerAuthSession]([authSubject]);
CREATE NONCLUSTERED INDEX [CustomerAuthSession_expiresAt_revokedAt_idx] ON [CustomerAuthSession]([expiresAt], [revokedAt]);

ALTER TABLE [CustomerAuthSession] ADD CONSTRAINT [CustomerAuthSession_userId_fkey]
FOREIGN KEY ([userId]) REFERENCES [User]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;
