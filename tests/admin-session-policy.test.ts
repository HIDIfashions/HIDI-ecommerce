import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveAdminSession,verifyAdminCode} from '../apps/api/src/admin/admin-session.js';
import {salesCutoff,requireSalesOwner} from '../apps/api/src/admin/admin-sales.service.js';
test('only the named, individually authenticated primary owner can delete sales',()=>{
  const actor={email:'fashionshidi@gmail.com',role:'OWNER',authMode:'SUPABASE'} as any;
  requireSalesOwner(actor);
  for(const value of [{...actor,email:'other@example.com'},{...actor,role:'OPERATIONS'},{...actor,role:'SUPPORT'},{...actor,authMode:'LEGACY_KEY'}])assert.throws(()=>requireSalesOwner(value));
});
test('cutoff is strictly midnight in India, with invalid calendar dates rejected',()=>{
  assert.equal(salesCutoff('2026-10-10').toISOString(),'2026-10-09T18:30:00.000Z');
  for(const v of ['2026-02-30','10.10.2026','2026-13-01','2099-01-01',null])assert.throws(()=>salesCutoff(v));
});
test('saved JWT, refresh token and legacy keys cannot open an admin session',async()=>{
  for(const authorization of [undefined,'Bearer saved.jwt.token','Bearer hidi_customer_abc','Bearer hidi_admin_x'])await assert.rejects(()=>resolveAdminSession({} as any,authorization));
  for(const body of [{accessToken:'saved.jwt',refreshToken:'saved'},{email:'fashionshidi@gmail.com',token:'12345678',accessToken:'saved'}])await assert.rejects(()=>verifyAdminCode({} as any,{} as any,body));
});
test('missing or revoked session and disabled staff are rejected without provider fallback',async()=>{
  const token='Bearer hidi_admin_'+'a'.repeat(64);
  await assert.rejects(()=>resolveAdminSession({$queryRaw:async()=>[]} as any,token));
  await assert.rejects(()=>resolveAdminSession({$executeRaw:async()=>0} as any,token,true));
  await assert.rejects(()=>resolveAdminSession({$queryRaw:async()=>[{active:false,role:'OWNER'}]} as any,token));
});
