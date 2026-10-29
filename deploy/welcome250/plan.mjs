import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {initialState,editableState,validate,publicOffer,RULE_SET} from '../offers/model.mjs';
export const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
export function welcomePlan(value,{id,actor,now=new Date().toISOString()}) {
  assert(id && actor,'An auditable release identity is required');
  const original=value??initialState();
  assert(!publicOffer(original.published,null).visible,'An existing public campaign must be reviewed before replacement');
  assert(!original.published?.config?.checkoutEnabled || original.published.config.audience==='HIDDEN','An enabled private campaign must be reviewed before replacement');
  const state=structuredClone(editableState(original));
  assert(!state.draft.startsAt&&!state.draft.endsAt,'An existing schedule must be reviewed before changing it');
  const config=validate({...state.draft,ruleSet:RULE_SET,couponVersion:1,welcomeEnabled:true,dressEnabled:false,checkoutEnabled:true,audience:'EVERYONE',startsAt:null,endsAt:null,
    primary:'WELCOME250: ₹250 off your first ₹1,499 order.',
    terms:'Use WELCOME250 for ₹250 off your first purchase of ₹1,499 or more, on current selling prices. Sign in with your verified mobile number. Merchandise qualifies; delivery does not. One use per new customer. No additional promotional coupons or reward redemption. Prices include applicable taxes. Existing delivery charges apply.'
  },{publishing:true});
  const revision={id,version:(state.published?.version||0)+1,config,publishedAt:now,actor:{id:actor}};
  state.draft=config;state.published=revision;state.history=[revision,...(state.history||[])].slice(0,20);state.savedAt=now;state.updatedBy=revision.actor;
  assert.deepEqual(config.eligibleProductIds,editableState(original).draft.eligibleProductIds,'Preserve the dress selection');
  return state;
}
