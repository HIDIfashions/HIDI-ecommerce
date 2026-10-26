-- Run the complete file using an existing authorized SQL owner in the live
-- database. No runtime DDL or direct audit/ledger mutation grants are added.
SET XACT_ABORT ON;
BEGIN TRANSACTION;
IF DB_NAME() <> N'hidi-sql-validation'
  THROW 50001, 'Unexpected database; verify the live app target', 1;
IF USER_ID(N'id-hidi-api') IS NULL
  THROW 50001, 'Expected existing runtime principal is missing', 1;
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

EXEC(N'CREATE OR ALTER PROCEDURE [dbo].[AdminSalesPrepareDeletion]
  @archiveId varchar(64)
AS
BEGIN
  SET NOCOUNT ON;
  IF @@TRANCOUNT = 0 THROW 50001, ''Sales deletion requires a transaction'', 1;
  DECLARE @cutoff datetime2, @count int, @archive nvarchar(max);
  SELECT @cutoff=[cutoff], @count=[orderCount], @archive=[archiveJson]
    FROM [dbo].[AdminSalesDeletion] WITH (UPDLOCK,HOLDLOCK)
    WHERE [id]=@archiveId AND [actorEmail]=N''fashionshidi@gmail.com'';
  IF @cutoff IS NULL OR @cutoff>SYSUTCDATETIME() OR @count<1 OR @count>5000 OR ISJSON(@archive)<>1
    THROW 50001, ''A complete primary-owner sales archive is required'', 1;
  IF NOT EXISTS(SELECT 1 FROM [dbo].[AdminStaff] WHERE [email]=N''fashionshidi@gmail.com'' AND [active]=1 AND [role]=N''OWNER'')
    THROW 50001, ''Primary owner is not active'', 1;
  DECLARE @orders TABLE ([id] nvarchar(64) NOT NULL PRIMARY KEY);
  INSERT INTO @orders SELECT [id] FROM OPENJSON(@archive, ''$.Order'') WITH ([id] nvarchar(64) ''$.id'');
  IF (SELECT COUNT(*) FROM @orders)<>@count OR
     (SELECT COUNT(*) FROM [dbo].[Order] WITH (UPDLOCK,HOLDLOCK) WHERE [createdAt]<@cutoff)<>@count OR
     (SELECT COUNT(*) FROM [dbo].[Order] o JOIN @orders a ON a.[id]=o.[id] WHERE o.[createdAt]<@cutoff)<>@count
    THROW 50001, ''Archived order set does not match the locked cutoff'', 1;
  -- Static statements retain same-owner ownership chaining. The runtime still
  -- cannot directly mutate ledger values or delete unrelated audit records.
  UPDATE l SET [orderId]=NULL FROM [dbo].[WalletLedger] l JOIN @orders a ON a.[id]=l.[orderId];
  DELETE e FROM [dbo].[OrderAuditEvent] e JOIN @orders a ON a.[id]=e.[orderId];
END;');
GRANT SELECT, INSERT, UPDATE, DELETE ON OBJECT::[dbo].[AdminLoginSession] TO [id-hidi-api];
GRANT SELECT, INSERT ON OBJECT::[dbo].[AdminSalesDeletion] TO [id-hidi-api];
GRANT EXECUTE ON OBJECT::[dbo].[AdminSalesPrepareDeletion] TO [id-hidi-api];
COMMIT TRANSACTION;
