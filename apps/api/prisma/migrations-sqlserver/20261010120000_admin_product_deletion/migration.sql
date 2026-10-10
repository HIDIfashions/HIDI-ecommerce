-- Allow the durable product-deletion tombstone while retaining historical foreign keys.
-- This intentionally changes only the existing status CHECK; no rows or columns change.
SET XACT_ABORT ON;
BEGIN TRY
    BEGIN TRANSACTION;

    IF OBJECT_ID(N'[dbo].[Product]', N'U') IS NULL
        THROW 51000, 'Product deletion migration requires the existing Product table.', 1;

    DECLARE @rowsBefore BIGINT;
    SELECT @rowsBefore = COUNT_BIG(*) FROM [dbo].[Product] WITH (TABLOCKX, HOLDLOCK);
    DECLARE @definition NVARCHAR(MAX), @disabled BIT, @untrusted BIT;
    SELECT @definition = [definition], @disabled = [is_disabled], @untrusted = [is_not_trusted]
      FROM sys.check_constraints
     WHERE [parent_object_id] = OBJECT_ID(N'[dbo].[Product]')
       AND [name] = N'Product_status_values';
    IF @definition IS NULL OR @disabled <> 0 OR @untrusted <> 0
        THROW 51001, 'Product status CHECK must already exist, be enabled, and be trusted.', 1;

    -- SQL Server may render an IN predicate as OR equalities in reverse order.
    -- Permit only those equivalent spellings of the three legacy values, optionally
    -- including DELETED. Reject missing/duplicate values and any additional expression.
    DECLARE @normalized NVARCHAR(MAX) = UPPER(@definition);
    SET @normalized = REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(
        @normalized, N'[', N''), N']', N''), N'(', N''), N')', N''), N' ', N''), NCHAR(9), N''), NCHAR(10), N''), NCHAR(13), N'');
    SET @normalized = REPLACE(@normalized, N'N''', N'''');
    SET @normalized = REPLACE(REPLACE(REPLACE(REPLACE(@normalized,
        N'''DRAFT''=STATUS', N'STATUS=''DRAFT'''), N'''ACTIVE''=STATUS', N'STATUS=''ACTIVE'''),
        N'''ARCHIVED''=STATUS', N'STATUS=''ARCHIVED'''), N'''DELETED''=STATUS', N'STATUS=''DELETED''');

    DECLARE @drafts INT = (LEN(@normalized) - LEN(REPLACE(@normalized, N'''DRAFT''', N''))) / LEN(N'''DRAFT''');
    DECLARE @actives INT = (LEN(@normalized) - LEN(REPLACE(@normalized, N'''ACTIVE''', N''))) / LEN(N'''ACTIVE''');
    DECLARE @archives INT = (LEN(@normalized) - LEN(REPLACE(@normalized, N'''ARCHIVED''', N''))) / LEN(N'''ARCHIVED''');
    DECLARE @deleted INT = (LEN(@normalized) - LEN(REPLACE(@normalized, N'''DELETED''', N''))) / LEN(N'''DELETED''');
    IF @drafts <> 1 OR @actives <> 1 OR @archives <> 1 OR @deleted NOT IN (0, 1)
        THROW 51002, 'Product status CHECK has unexpected allowed values; migration stopped.', 1;
    -- Literal case is business-significant in the binary-collated product status.
    IF @drafts <> (LEN(@definition) - LEN(REPLACE(@definition COLLATE Latin1_General_100_BIN2, N'''DRAFT''', N''))) / LEN(N'''DRAFT''')
       OR @actives <> (LEN(@definition) - LEN(REPLACE(@definition COLLATE Latin1_General_100_BIN2, N'''ACTIVE''', N''))) / LEN(N'''ACTIVE''')
       OR @archives <> (LEN(@definition) - LEN(REPLACE(@definition COLLATE Latin1_General_100_BIN2, N'''ARCHIVED''', N''))) / LEN(N'''ARCHIVED''')
       OR @deleted <> (LEN(@definition) - LEN(REPLACE(@definition COLLATE Latin1_General_100_BIN2, N'''DELETED''', N''))) / LEN(N'''DELETED''')
        THROW 51002, 'Product status CHECK has unexpected allowed values; migration stopped.', 1;

    DECLARE @orResidual NVARCHAR(MAX) = REPLACE(REPLACE(REPLACE(REPLACE(@normalized,
        N'STATUS=''DRAFT''', N''), N'STATUS=''ACTIVE''', N''), N'STATUS=''ARCHIVED''', N''), N'STATUS=''DELETED''', N'');
    DECLARE @orCount INT = (LEN(@orResidual) - LEN(REPLACE(@orResidual, N'OR', N''))) / 2;
    SET @orResidual = REPLACE(@orResidual, N'OR', N'');
    DECLARE @inResidual NVARCHAR(MAX) = REPLACE(@normalized, N'STATUSIN', N'');
    SET @inResidual = REPLACE(REPLACE(REPLACE(REPLACE(@inResidual,
        N'''DRAFT''', N''), N'''ACTIVE''', N''), N'''ARCHIVED''', N''), N'''DELETED''', N'');
    DECLARE @commaCount INT = LEN(@inResidual) - LEN(REPLACE(@inResidual, N',', N''));
    SET @inResidual = REPLACE(@inResidual, N',', N'');
    IF NOT ((@orResidual = N'' AND @orCount = 2 + @deleted)
         OR (@normalized LIKE N'STATUSIN%' AND @inResidual = N'' AND @commaCount = 2 + @deleted))
        THROW 51003, 'Product status CHECK has an unexpected expression; migration stopped.', 1;

    IF @deleted = 0
    BEGIN
        ALTER TABLE [dbo].[Product] DROP CONSTRAINT [Product_status_values];
        ALTER TABLE [dbo].[Product] WITH CHECK ADD CONSTRAINT [Product_status_values]
            CHECK ([status] IN ('DRAFT', 'ACTIVE', 'ARCHIVED', 'DELETED'));
    END;

    IF NOT EXISTS (SELECT 1 FROM sys.check_constraints
                    WHERE [parent_object_id] = OBJECT_ID(N'[dbo].[Product]')
                      AND [name] = N'Product_status_values'
                      AND [is_disabled] = 0 AND [is_not_trusted] = 0)
        THROW 51004, 'Product status CHECK validation did not complete.', 1;
    IF (SELECT COUNT_BIG(*) FROM [dbo].[Product]) <> @rowsBefore
        THROW 51005, 'Product rows changed during the status CHECK migration.', 1;

    COMMIT TRANSACTION;
END TRY
BEGIN CATCH
    IF XACT_STATE() <> 0 ROLLBACK TRANSACTION;
    THROW;
END CATCH;
