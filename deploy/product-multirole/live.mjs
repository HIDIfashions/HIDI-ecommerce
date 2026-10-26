import assert from 'node:assert/strict';
import {createHash,randomBytes} from 'node:crypto';
export async function run(mode){
  const {PrismaService}=await import('file:///app/apps/api/dist/prisma/prisma.service.js');
  const db=new PrismaService();await db.$connect();
  try{
    await db.$queryRawUnsafe('SELECT TOP (0) [rolesJson] FROM [dbo].[AdminStaff]');
    const [rights]=await db.$queryRawUnsafe("SELECT HAS_PERMS_BY_NAME('dbo.AdminStaff','OBJECT','UPDATE') AS staffUpdate");
    assert.equal(rights.staffUpdate,1);
    if(mode==='schema'||mode==='inspect'){console.log('HIDI_SECURITY_LIVE::'+JSON.stringify({passed:true,schemaReady:true}));return;}
    assert.equal(mode,'verify');
    const {AdminAuthService}=await import('file:///app/apps/api/dist/admin/admin-auth.js');
    const {resolveAdminSession}=await import('file:///app/apps/api/dist/admin/admin-session.js');
    const prefix='multirole-rollback-'+randomBytes(10).toString('hex'),email=prefix+'@example.invalid';
    const rollback=new Error('EXPECTED_ROLLBACK');let checks=0;
    try{await db.$transaction(async tx=>{
      const scoped=new Proxy(tx,{get(target,key){if(key==='$transaction')return work=>work(tx);return target[key];}});
      const service=new AdminAuthService(scoped,{});
      const staff=await service.createStaff({email,displayName:'Rollback verification',roles:['CATALOG','SUPPORT']});
      assert.deepEqual(staff.roles,['SUPPORT','CATALOG']);checks++;
      const token='hidi_admin_'+randomBytes(32).toString('hex'),digest=createHash('sha256').update(token).digest('hex');
      await tx.$executeRaw`INSERT INTO [dbo].[AdminLoginSession] ([tokenHash],[staffId],[createdAt],[lastActivityAt]) VALUES (${digest},${staff.id},SYSUTCDATETIME(),SYSUTCDATETIME())`;
      let actor=await resolveAdminSession(tx,'Bearer '+token);
      assert.deepEqual(actor.roles,staff.roles);assert(service.hasPermission(actor,'catalog:write'));assert(service.hasPermission(actor,'support:write'));checks+=3;
      for(const permission of ['staff:manage','support:approve','order:write']){assert(!service.hasPermission(actor,permission));checks++;}
      const owner=await tx.adminStaff.findFirst({where:{email:'fashionshidi@gmail.com',active:true}});assert.equal(owner?.role,'OWNER');
      await service.updateStaff(staff.id,{roles:['CATALOG','OPERATIONS','SUPPORT']},{...owner,authMode:'SUPABASE'});
      actor=await resolveAdminSession(tx,'Bearer '+token);assert.deepEqual(actor.roles,['OPERATIONS','SUPPORT','CATALOG']);assert(service.hasPermission(actor,'order:write'));assert(!service.hasPermission(actor,'staff:manage'));checks+=3;
      await service.updateStaff(staff.id,{roles:['SUPPORT']},{...owner,authMode:'SUPABASE'});
      actor=await resolveAdminSession(tx,'Bearer '+token);assert(!service.hasPermission(actor,'catalog:write'));checks++;
      await tx.$executeRaw`UPDATE [dbo].[AdminLoginSession] SET [lastActivityAt]=DATEADD(minute,-61,SYSUTCDATETIME()) WHERE [tokenHash]=${digest}`;
      await assert.rejects(()=>resolveAdminSession(tx,'Bearer '+token));checks++;
      throw rollback;
    },{timeout:60000});}catch(error){if(error!==rollback)throw error;}
    assert.equal(await db.adminStaff.count({where:{email}}),0);checks++;
    console.log('HIDI_SECURITY_LIVE::'+JSON.stringify({passed:true,checks,rollbackOnly:true,combinedPermissions:true,immediateRoleChanges:true,idleExpiryPreserved:true}));
  }finally{await db.$disconnect();}
}
