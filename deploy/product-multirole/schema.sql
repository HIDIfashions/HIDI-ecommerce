SET XACT_ABORT ON;
BEGIN TRANSACTION;
IF DB_NAME()<>N'hidi-sql-validation' THROW 50001,'Unexpected database',1;
IF COL_LENGTH(N'dbo.AdminStaff',N'rolesJson') IS NULL
BEGIN
  ALTER TABLE dbo.AdminStaff ADD rolesJson nvarchar(200) NULL;
  EXEC(N'ALTER TABLE dbo.AdminStaff ADD CONSTRAINT AdminStaff_rolesJson_valid CHECK (rolesJson IS NULL OR ISJSON(rolesJson)=1)');
END;
COMMIT TRANSACTION;
