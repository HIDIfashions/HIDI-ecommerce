-- Owner-only additive migration; apply the complete file through an existing
-- authorized private route after a fresh SQL PITR checkpoint and image backups.
-- It changes no Product columns, runtime identities or permission grants.
SET NOCOUNT ON;
SET XACT_ABORT ON;
BEGIN TRY
    BEGIN TRANSACTION;
    DECLARE @lockResult INT;
    EXEC @lockResult=sys.sp_getapplock @Resource=N'hidi-product-skn-migration-v1',
        @LockMode='Exclusive',@LockOwner='Transaction',@LockTimeout=30000;
    IF @lockResult<0 THROW 51001,'Product SKN migration lock unavailable',1;
    IF OBJECT_ID(N'dbo.Product',N'U') IS NULL THROW 51002,'Existing Product baseline required',1;
    IF (SELECT COUNT(*) FROM sys.columns WHERE object_id=OBJECT_ID(N'dbo.Product')
        AND name=N'id' AND TYPE_NAME(user_type_id)=N'nvarchar' AND max_length=128 AND is_nullable=0)<>1
        THROW 51003,'Existing Product identifier schema differs',1;
    IF (SELECT COUNT(*) FROM sys.columns WHERE object_id=OBJECT_ID(N'dbo.Product')
        AND name=N'createdAt' AND TYPE_NAME(user_type_id)=N'datetime2' AND is_nullable=0)<>1
        THROW 51004,'Existing Product creation timestamp schema differs',1;
    -- Keep concurrent creation outside initial setup/backfill until commit.
    DECLARE @productCount BIGINT;
    SELECT @productCount=COUNT_BIG(*) FROM dbo.Product WITH(TABLOCKX,HOLDLOCK);
    DECLARE @productSchemaHash VARBINARY(32)=HASHBYTES('SHA2_256',
        (SELECT column_id,name,user_type_id,max_length,is_nullable,collation_name
         FROM sys.columns WHERE object_id=OBJECT_ID(N'dbo.Product') ORDER BY column_id FOR JSON PATH));
    DECLARE @tableId INT=OBJECT_ID(N'dbo.HidiProductSKN',N'U');
    DECLARE @sequenceId INT=OBJECT_ID(N'dbo.HidiProductSknSequence',N'SO');
    IF (CASE WHEN @tableId IS NULL THEN 0 ELSE 1 END+CASE WHEN @sequenceId IS NULL THEN 0 ELSE 1 END) NOT IN(0,2)
        THROW 51005,'Partial Product SKN schema requires owner review',1;
    IF (@tableId IS NULL AND OBJECT_ID(N'dbo.HidiProductSKN') IS NOT NULL)
        OR (@sequenceId IS NULL AND OBJECT_ID(N'dbo.HidiProductSknSequence') IS NOT NULL)
        THROW 51006,'Unexpected Product SKN object type',1;
    IF @tableId IS NULL AND @productCount>90000 THROW 51007,'Five-digit capacity insufficient for backfill',1;
    IF @tableId IS NULL
    BEGIN
        EXEC(N'CREATE SEQUENCE dbo.HidiProductSknSequence AS INT START WITH 10000
            INCREMENT BY 1 MINVALUE 10000 MAXVALUE 99999 NO CYCLE NO CACHE;');
        EXEC(N'CREATE TABLE dbo.HidiProductSKN(
            productId NVARCHAR(64) COLLATE DATABASE_DEFAULT NOT NULL,
            skn CHAR(5) COLLATE Latin1_General_100_BIN2 NOT NULL
                CONSTRAINT HidiProductSKN_skn_df DEFAULT(CONVERT(CHAR(5),NEXT VALUE FOR dbo.HidiProductSknSequence)),
            CONSTRAINT HidiProductSKN_pkey PRIMARY KEY(productId),
            CONSTRAINT HidiProductSKN_skn_key UNIQUE(skn),
            CONSTRAINT HidiProductSKN_skn_values CHECK(
                skn COLLATE Latin1_General_100_BIN2 LIKE ''[1-9][0-9][0-9][0-9][0-9]''
                AND skn>=''10000'' AND skn<=''99999'')
        );');
        -- No Product FK: retain code reservations after a future hard deletion.
        SET @tableId=OBJECT_ID(N'dbo.HidiProductSKN',N'U');
        SET @sequenceId=OBJECT_ID(N'dbo.HidiProductSknSequence',N'SO');
    END;
    -- Reruns verify existing objects and never restart, recreate or repair them.
    IF (SELECT COUNT(*) FROM sys.columns WHERE object_id=@tableId)<>2
        OR (SELECT COUNT(*) FROM sys.columns WHERE object_id=@tableId AND name=N'productId'
            AND TYPE_NAME(user_type_id)=N'nvarchar' AND max_length=128 AND is_nullable=0
            AND collation_name=CAST(DATABASEPROPERTYEX(DB_NAME(),'Collation') AS NVARCHAR(128)))<>1
        OR (SELECT COUNT(*) FROM sys.columns WHERE object_id=@tableId AND name=N'skn'
            AND TYPE_NAME(user_type_id)=N'char' AND max_length=5 AND is_nullable=0 AND collation_name=N'Latin1_General_100_BIN2')<>1
        THROW 51008,'Product SKN columns differ',1;
    IF EXISTS(SELECT 1 FROM sys.foreign_keys WHERE parent_object_id=@tableId)
        THROW 51019,'Product SKN reservations must survive hard deletion',1;
    IF (SELECT COUNT(*) FROM sys.indexes i JOIN sys.index_columns ic ON ic.object_id=i.object_id AND ic.index_id=i.index_id
        JOIN sys.columns c ON c.object_id=ic.object_id AND c.column_id=ic.column_id WHERE i.object_id=@tableId
        AND i.name=N'HidiProductSKN_pkey' AND i.is_unique=1 AND i.is_primary_key=1 AND i.is_disabled=0 AND i.has_filter=0
        AND ic.key_ordinal=1 AND c.name=N'productId')<>1
        OR (SELECT COUNT(*) FROM sys.index_columns WHERE object_id=@tableId
            AND index_id=(SELECT index_id FROM sys.indexes WHERE object_id=@tableId AND name=N'HidiProductSKN_pkey') AND key_ordinal>0)<>1
        THROW 51009,'Product SKN primary key differs',1;
    IF (SELECT COUNT(*) FROM sys.indexes i JOIN sys.index_columns ic ON ic.object_id=i.object_id AND ic.index_id=i.index_id
        JOIN sys.columns c ON c.object_id=ic.object_id AND c.column_id=ic.column_id WHERE i.object_id=@tableId
        AND i.name=N'HidiProductSKN_skn_key' AND i.is_unique=1 AND i.is_primary_key=0 AND i.is_disabled=0 AND i.has_filter=0
        AND ic.key_ordinal=1 AND c.name=N'skn')<>1
        OR (SELECT COUNT(*) FROM sys.index_columns WHERE object_id=@tableId
            AND index_id=(SELECT index_id FROM sys.indexes WHERE object_id=@tableId AND name=N'HidiProductSKN_skn_key') AND key_ordinal>0)<>1
        THROW 51010,'Product SKN unique index differs',1;
    DECLARE @checkDefinition NVARCHAR(MAX);
    SELECT @checkDefinition=definition FROM sys.check_constraints WHERE parent_object_id=@tableId
        AND name=N'HidiProductSKN_skn_values' AND is_disabled=0 AND is_not_trusted=0;
    IF (SELECT COUNT(*) FROM sys.check_constraints WHERE parent_object_id=@tableId)<>1 OR @checkDefinition IS NULL
        THROW 51011,'Product SKN trusted value check differs',1;
    SET @checkDefinition=LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(@checkDefinition,N' ',N''),N'[',N''),N']',N''),N'(',N''),N')',N''),CHAR(13),N''),CHAR(10),N''));
    IF @checkDefinition<>N'skncollatelatin1_general_100_bin2like''1-90-90-90-90-9''andskn>=''10000''andskn<=''99999'''
        THROW 51012,'Product SKN value check definition differs',1;
    DECLARE @defaultDefinition NVARCHAR(MAX);
    SELECT @defaultDefinition=d.definition FROM sys.default_constraints d JOIN sys.columns c
        ON c.object_id=d.parent_object_id AND c.column_id=d.parent_column_id
        WHERE d.parent_object_id=@tableId AND d.name=N'HidiProductSKN_skn_df' AND c.name=N'skn';
    IF (SELECT COUNT(*) FROM sys.default_constraints WHERE parent_object_id=@tableId)<>1 OR @defaultDefinition IS NULL
        THROW 51013,'Product SKN sequence default missing',1;
    SET @defaultDefinition=LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(@defaultDefinition,N' ',N''),N'[',N''),N']',N''),N'(',N''),N')',N''),CHAR(13),N''),CHAR(10),N''));
    IF @defaultDefinition NOT IN(N'convertchar5,nextvaluefordbo.hidiproductsknsequence',N'convertchar5,nextvaluefordbo.hidiproductsknsequence,0')
        THROW 51014,'Product SKN sequence default definition differs',1;
    IF (SELECT COUNT(*) FROM sys.sequences WHERE object_id=@sequenceId AND TYPE_NAME(user_type_id)=N'int'
        AND CAST(start_value AS INT)=10000 AND CAST(increment AS INT)=1 AND CAST(minimum_value AS INT)=10000
        AND CAST(maximum_value AS INT)=99999 AND is_cycling=0 AND is_cached=0)<>1
        THROW 51015,'Product SKN sequence bounds differ',1;
    IF EXISTS(SELECT 1 FROM dbo.HidiProductSKN WHERE TRY_CONVERT(INT,skn)>
        (SELECT CAST(current_value AS INT) FROM sys.sequences WHERE object_id=@sequenceId))
        THROW 51020,'Product SKN sequence counter is behind reserved numbers',1;
    -- Explicit sequence ordering gives existing products stable initial codes.
    -- The API allocates missing rows inside its own product transaction after
    -- deployment, including legacy-revision products created during rollout.
    EXEC(N'INSERT INTO dbo.HidiProductSKN(productId,skn)
        SELECT p.id,CONVERT(CHAR(5),NEXT VALUE FOR dbo.HidiProductSknSequence OVER(ORDER BY p.createdAt,p.id))
        FROM dbo.Product p WHERE NOT EXISTS(SELECT 1 FROM dbo.HidiProductSKN s WHERE s.productId=p.id COLLATE DATABASE_DEFAULT);');
    IF EXISTS(SELECT 1 FROM dbo.Product p LEFT JOIN dbo.HidiProductSKN s ON s.productId=p.id COLLATE DATABASE_DEFAULT WHERE s.productId IS NULL)
        THROW 51016,'Product SKN coverage incomplete',1;
    IF EXISTS(SELECT 1 FROM dbo.HidiProductSKN WHERE skn COLLATE Latin1_General_100_BIN2 NOT LIKE '[1-9][0-9][0-9][0-9][0-9]' OR skn<'10000' OR skn>'99999')
        THROW 51017,'Invalid Product SKN value',1;
    IF @productSchemaHash<>HASHBYTES('SHA2_256',(SELECT column_id,name,user_type_id,max_length,is_nullable,collation_name
        FROM sys.columns WHERE object_id=OBJECT_ID(N'dbo.Product') ORDER BY column_id FOR JSON PATH))
        THROW 51018,'Existing Product columns changed unexpectedly',1;
    COMMIT TRANSACTION;
    SELECT CAST(1 AS BIT) AS installed,CAST(1 AS BIT) AS existingProductColumnsPreserved,
        CAST(0 AS BIT) AS existingProductRowsModified,CAST(0 AS BIT) AS identityOrPermissionChanges,
        CAST(0 AS BIT) AS sequenceRestarted,(SELECT COUNT_BIG(*) FROM dbo.HidiProductSKN) AS reservedSknCount;
END TRY
BEGIN CATCH
    IF XACT_STATE()<>0 ROLLBACK TRANSACTION;
    THROW;
END CATCH;
