IF OBJECT_ID(N'dbo.AdminLoginSession',N'U') IS NULL
BEGIN
  CREATE TABLE [dbo].[AdminLoginSession] (
    [tokenHash] varchar(64) NOT NULL PRIMARY KEY,
    [staffId] nvarchar(64) NOT NULL,
    [createdAt] datetime2 NOT NULL,
    [lastActivityAt] datetime2 NOT NULL,
    [revokedAt] datetime2 NULL,
    CONSTRAINT [AdminLoginSession_staffId_fkey] FOREIGN KEY ([staffId]) REFERENCES [dbo].[AdminStaff]([id])
  );
  CREATE INDEX [AdminLoginSession_staffId_idx] ON [dbo].[AdminLoginSession]([staffId]);
END;
IF OBJECT_ID(N'dbo.AdminSalesDeletion',N'U') IS NULL
BEGIN
  CREATE TABLE [dbo].[AdminSalesDeletion] (
    [id] varchar(64) NOT NULL PRIMARY KEY,
    [actorEmail] nvarchar(254) NOT NULL,
    [cutoff] datetime2 NOT NULL,
    [createdAt] datetime2 NOT NULL DEFAULT SYSUTCDATETIME(),
    [orderCount] int NOT NULL,
    [archiveJson] nvarchar(max) NOT NULL
  );
END;
