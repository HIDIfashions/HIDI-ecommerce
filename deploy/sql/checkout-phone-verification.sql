-- Additive Azure SQL / SQL Server schema for checkout-only phone verification.
-- Review and apply to the intended existing database BEFORE enabling the feature.
-- Do NOT run the historical PostgreSQL prisma/migrations against Azure SQL.
-- No existing orders, customers, inventory, payment or auth tables are modified.
SET XACT_ABORT ON;
BEGIN TRANSACTION;
IF OBJECT_ID(N'dbo.CheckoutPhoneChallenge', N'U') IS NULL
BEGIN
  CREATE TABLE [dbo].[CheckoutPhoneChallenge] (
    [id] NVARCHAR(64) NOT NULL,
    [sessionHash] NVARCHAR(64) NOT NULL,
    [phoneHash] NVARCHAR(64) NOT NULL,
    [actorHash] NVARCHAR(64) NOT NULL,
    [status] NVARCHAR(20) NOT NULL CONSTRAINT [CheckoutPhoneChallenge_status_df] DEFAULT N'SENDING',
    [attempts] INT NOT NULL CONSTRAINT [CheckoutPhoneChallenge_attempts_df] DEFAULT 0,
    [expiresAt] DATETIME2 NOT NULL,
    [grantHash] NVARCHAR(64) NULL,
    [grantExpiresAt] DATETIME2 NULL,
    [checkoutTokenHash] NVARCHAR(64) NULL,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [CheckoutPhoneChallenge_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [CheckoutPhoneChallenge_pkey] PRIMARY KEY CLUSTERED ([id])
  );
  CREATE INDEX [CheckoutPhoneChallenge_phoneHash_status_idx] ON [dbo].[CheckoutPhoneChallenge] ([phoneHash],[status]);
  CREATE INDEX [CheckoutPhoneChallenge_sessionHash_actorHash_status_idx] ON [dbo].[CheckoutPhoneChallenge] ([sessionHash],[actorHash],[status]);
  CREATE INDEX [CheckoutPhoneChallenge_createdAt_idx] ON [dbo].[CheckoutPhoneChallenge] ([createdAt]);
END;
IF OBJECT_ID(N'dbo.CheckoutPhoneRate', N'U') IS NULL
BEGIN
  CREATE TABLE [dbo].[CheckoutPhoneRate] (
    [id] NVARCHAR(64) NOT NULL,
    [count] INT NOT NULL,
    [windowStartedAt] DATETIME2 NOT NULL,
    [lastSentAt] DATETIME2 NOT NULL,
    CONSTRAINT [CheckoutPhoneRate_pkey] PRIMARY KEY CLUSTERED ([id])
  );
  CREATE INDEX [CheckoutPhoneRate_windowStartedAt_idx] ON [dbo].[CheckoutPhoneRate] ([windowStartedAt]);
END;
COMMIT TRANSACTION;
-- Deployment must also inspect existing table columns/indexes if the tables pre-existed.
