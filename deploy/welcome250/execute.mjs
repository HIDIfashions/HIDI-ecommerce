import assert from 'node:assert/strict';import {digest} from './plan.mjs';import {initialState} from '../offers/model.mjs';
export async function recover(store,plan) {
 const current=await store.load();
 if(digest(current.value)===digest(plan.before.value))return {restored:true,alreadyOriginal:true};
 if(digest(current.value)!==digest(plan.after))return {restored:false,concurrentEditPreserved:true};
 await store.save(plan.before.value??initialState(),current.etag);
 const restored=await store.load();assert.equal(digest(restored.value),digest(plan.before.value??initialState()));return {restored:true};
}
export async function activate({store,plan,unchanged,verify}) {
 await unchanged();const current=await store.load();
 assert.equal(current.etag,plan.before.etag,'Offer settings changed since preflight');
 assert.equal(digest(current.value),digest(plan.before.value),'Offer state changed since preflight');
 const backup={id:plan.backupId,value:plan.before.value,sourceEtag:plan.before.etag,release:plan.release};
 await store.archive(backup);assert.equal(digest((await store.version(plan.backupId)).value),digest(backup),'Private rollback backup could not be verified');
 try {
  await unchanged();await store.save(plan.after,plan.before.etag);
  assert.equal(digest((await store.load()).value),digest(plan.after),'Published state differs from the reviewed plan');
  await verify();await unchanged();return {passed:true,version:plan.after.published.version,backupId:plan.backupId};
 }catch(error){const rollback=await recover(store,plan);throw Object.assign(new Error(error.message),{rollback});}
}
