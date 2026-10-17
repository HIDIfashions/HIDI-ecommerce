import assert from 'node:assert/strict';
export async function run(mode) {
  const {PrismaService}=await import('file:///app/apps/api/dist/prisma/prisma.service.js');
  const db=new PrismaService();await db.$connect();
  const email='fashionshidi@gmail.com';
  try {
    const members=await db.adminStaff.findMany({select:{id:true,email:true,role:true,active:true,authSubject:true,displayName:true}});
    const matches=members.filter(row=>row.email.trim().toLowerCase()===email);assert(matches.length<=1,'Primary Owner email is ambiguous');
    let primary=matches[0];
    if(mode==='owner'){
      if(primary)primary=await db.adminStaff.update({where:{id:primary.id},data:{email,role:'OWNER',active:true}});
      else primary=await db.adminStaff.create({data:{email,displayName:'HIDI Super Admin',role:'OWNER',active:true}});
      console.log('HIDI_SUPPORT_LIVE::'+JSON.stringify({passed:true,primaryOwnerEmail:email,primaryOwnerRole:primary.role,primaryOwnerActive:primary.active,created:matches.length===0}));return;
    }
    if(mode==='inspect'){
      console.log('HIDI_SUPPORT_LIVE::'+JSON.stringify({passed:true,staffCount:members.length,primaryOwnerPresent:!!primary,primaryOwnerRole:primary?.role,primaryOwnerActive:primary?.active,emailDeliveryConfigured:!!(process.env.SUPABASE_URL&&process.env.SUPABASE_PUBLISHABLE_KEY),apiConfigured:true,serviceAuthConfigured:!!process.env.SUPABASE_SERVICE_ROLE_KEY}));return;
    }
    assert(primary?.active&&primary.role==='OWNER','Primary Owner must be active');
    const {AdminSupportService}=await import('file:///app/apps/api/dist/admin/admin-support.service.js');
    const {AdminAuthService}=await import('file:///app/apps/api/dist/admin/admin-auth.js');
    const {createRequire}=await import('node:module');const require=createRequire('/app/apps/api/package.json');
    require('reflect-metadata');const {Reflector}=require('@nestjs/core');
    const {AdminGuard}=await import('file:///app/apps/api/dist/admin/admin-auth.js');
    const {AdminSupportController}=await import('file:///app/apps/api/dist/admin/admin-support.controller.js');
    const {AdminController}=await import('file:///app/apps/api/dist/admin/admin.controller.js');
    const result={passed:false,primaryOwnerEmail:email,primaryOwnerRole:primary.role,primaryOwnerActive:true,rollbackOnly:true,financialActionsExecuted:0,checks:[]};
    const rollback=new Error('HIDI_EXPECTED_TEST_ROLLBACK');
    try{await db.$transaction(async tx=>{
      const service=new AdminSupportService(tx);
      const staff=await tx.adminStaff.create({data:{email:`hidi-support-probe-${Date.now()}@example.invalid`,displayName:'Rollback-only support probe',role:'SUPPORT',active:true}});
      const actor={id:staff.id,role:'SUPPORT',displayName:staff.displayName,authSubject:null,email:staff.email,authMode:'SUPABASE'};
      const owner={...actor,id:primary.id,role:'OWNER',displayName:primary.displayName,email};
      const auth=new AdminAuthService(tx,{requireUser:async()=>({id:'rollback-test-subject',email:staff.email,emailVerified:true})});
      const resolved=await auth.resolveActor({authorization:'Bearer rollback-test-token'});assert.equal(resolved.role,'SUPPORT');result.checks.push('actual-database-staff-role-and-identity-binding');
      const guard=new AdminGuard({resolveActor:async()=>resolved,hasPermission:auth.hasPermission.bind(auth)},new Reflector());
      const context=(klass,name)=>({switchToHttp:()=>({getRequest:()=>({headers:{}})}),getHandler:()=>klass.prototype[name],getClass:()=>klass});
      assert(await guard.canActivate(context(AdminSupportController,'supportUpdate')));
      for(const name of ['updateReturn','updateStatus','saveShipment','delhiveryManifest','createStaff'])await assert.rejects(()=>guard.canActivate(context(AdminController,name)));
      await assert.rejects(()=>guard.canActivate(context(AdminSupportController,'supportDecision')));result.checks.push('live-compiled-controller-role-boundaries');
      await assert.rejects(()=>auth.updateStaff(primary.id,{active:false},owner),/primary HIDI Owner/);
      await assert.rejects(()=>auth.updateStaff(primary.id,{role:'SUPPORT'},owner),/primary HIDI Owner/);result.checks.push('primary-owner-disable-and-demotion-blocked');
      await tx.adminStaff.update({where:{id:staff.id},data:{active:false}});
      await assert.rejects(()=>auth.resolveActor({authorization:'Bearer rollback-test-token'}));result.checks.push('disabled-user-session-blocked');
      const order=await tx.order.findFirst({select:{id:true,orderNumber:true}});
      if(order){
        const before=await tx.order.findUnique({where:{id:order.id}});
        await service.create(order.orderNumber,{kind:'NOTE',text:'Rollback-only deployment verification'},actor);
        await service.create(order.orderNumber,{kind:'TAGS',tags:['release-test']},actor);
        await service.create(order.orderNumber,{kind:'FOLLOW_UP',status:'OPEN',text:'Rollback-only follow-up',dueAt:'2030-01-01T10:00:00Z'},actor);
        const history=await service.list(order.orderNumber);assert(history.events.some(event=>event.actorId===staff.id&&event.kind==='NOTE'));
        for(const type of ['REFUND','CANCELLATION','COMPENSATION','ORDER_CHANGE']){
          const request=await service.create(order.orderNumber,{kind:'APPROVAL_REQUEST',type,text:'Rollback-only approval verification',amountPaise:100},actor);
          await assert.rejects(()=>service.decide(order.orderNumber,request.id,{decision:'APPROVED',text:'Test'},actor));
          await service.decide(order.orderNumber,request.id,{decision:type==='COMPENSATION'?'REJECTED':'APPROVED',text:'Rollback-only Owner decision'},owner);
        }
        await service.create(order.orderNumber,{kind:'FOLLOW_UP',status:'DONE',text:'Rollback-only closure'},actor);
        assert.deepEqual(await tx.order.findUnique({where:{id:order.id}}),before);
        result.checks.push('live-database-notes-tags-followups-all-four-approvals','order-record-unchanged');
      }else result.checks.push('no-orders-present-support-writes-covered-by-candidate-fixtures');
      throw rollback;
    },{timeout:90000});}catch(error){if(error!==rollback)throw error;}
    assert.equal(await db.adminStaff.count({where:{email:{startsWith:'hidi-support-probe-'}}}),0);
    result.checks.push('test-users-and-events-rolled-back');result.passed=true;
    console.log('HIDI_SUPPORT_LIVE::'+JSON.stringify(result));
  }finally{await db.$disconnect();}
}
