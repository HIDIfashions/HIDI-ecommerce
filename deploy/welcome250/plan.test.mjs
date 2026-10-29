import test from 'node:test';import assert from 'node:assert/strict';
import {welcomePlan,digest} from './plan.mjs';
import {initialState,publicOffer} from '../offers/model.mjs';
const context={id:'welcome250-test',actor:'release-test',now:'2026-10-29T10:00:00.000Z'};
test('welcome can launch from an unpublished store without a GET1 collection',()=>{
 const plan=welcomePlan(null,context);assert.equal(plan.published.config.welcomeEnabled,true);assert.equal(plan.published.config.dressEnabled,false);assert.equal(plan.published.config.checkoutEnabled,true);assert.equal(plan.published.config.audience,'EVERYONE');assert.equal(publicOffer(plan.published,null).secondary,'');assert(!publicOffer(plan.published,null).terms.includes('GET1'));
});
test('existing dress selection, private audience list and history are retained without mutating the snapshot',()=>{
 const state=initialState();state.draft.eligibleProductIds=Array.from({length:14},(_,i)=>'dress-'+i);state.draft.allowedPhones=['+919000000001'];state.published={id:'old',version:7,config:{...state.draft,audience:'HIDDEN'}};state.history=[state.published];const before=digest(state),plan=welcomePlan(state,context);
 assert.equal(digest(state),before);assert.equal(plan.published.version,8);assert.deepEqual(plan.draft.eligibleProductIds,state.draft.eligibleProductIds);assert.deepEqual(plan.draft.allowedPhones,state.draft.allowedPhones);assert.deepEqual(plan.history[1],state.published);assert.equal(plan.updatedBy.id,context.actor);
});
test('an active public or private campaign cannot be overwritten silently',()=>{
 for(const audience of ['EVERYONE','SELECTED']){const s=initialState();s.published={version:1,config:{...s.draft,audience,checkoutEnabled:true}};assert.throws(()=>welcomePlan(s,context),/reviewed/);}
});
test('scheduled drafts and missing release identity stop activation',()=>{
 const s=initialState();s.draft.startsAt='2026-10-30T00:00:00.000Z';assert.throws(()=>welcomePlan(s,context),/schedule/);assert.throws(()=>welcomePlan(null,{id:'test'}),/identity/);
});
