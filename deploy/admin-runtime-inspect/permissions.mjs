export async function run(){
  const {PrismaService}=await import('file:///app/apps/api/dist/prisma/prisma.service.js');const db=new PrismaService();await db.$connect();
  try{
    const principals=await db.$queryRawUnsafe("SELECT name, IS_ROLEMEMBER(N'db_owner',name) AS dbOwner, IS_ROLEMEMBER(N'db_ddladmin',name) AS ddlAdmin FROM sys.database_principals WHERE name LIKE '%migration%'");
    const permissions=await db.$queryRawUnsafe("SELECT HAS_PERMS_BY_NAME(N'dbo.BackgroundLease',N'OBJECT',N'SELECT') AS leaseRead,HAS_PERMS_BY_NAME(N'dbo.BackgroundLease',N'OBJECT',N'INSERT') AS leaseInsert,HAS_PERMS_BY_NAME(N'dbo.BackgroundLease',N'OBJECT',N'UPDATE') AS leaseUpdate,HAS_PERMS_BY_NAME(N'dbo.BackgroundLease',N'OBJECT',N'DELETE') AS leaseDelete");
    console.log('HIDI_SECURITY_LIVE::'+JSON.stringify({passed:true,principals,permissions}));
  }finally{await db.$disconnect();}
}
