import {initialState,editableState,validate,eligible,publicOffer,RULE_SET,rules,fail} from './model.mjs';
export const codes=['WELCOME250','GET1'];
export function checkCode(code){if(!codes.includes(code))throw fail(400,'Choose WELCOME250 or GET1');return code;}
const flag=code=>code==='WELCOME250'?'welcomeEnabled':'dressEnabled';
function fromLegacy(config,code){
 return {title:config[code==='WELCOME250'?'primary':'secondary'],terms:config.terms,audience:config.audience,allowedPhones:[...(config.allowedPhones||[])],startsAt:config.startsAt,endsAt:config.endsAt,checkoutEnabled:config.checkoutEnabled===true&&config[flag(code)]===true,landingEnabled:config[flag(code)]===true,eligibleProductIds:code==='GET1'?[...(config.eligibleProductIds||[])]:[]};
}
// Migration is in memory on reads. The first scoped owner write persists it atomically.
export function independentState(value){
 if(value?.schema===3)return structuredClone(value);
 const old=editableState(value||initialState()),valid=old.published?.config?.ruleSet===RULE_SET&&old.published?.config?.couponVersion===1;
 return {schema:3,version:old.published?.version||0,offers:Object.fromEntries(codes.map(code=>{
  const published=valid&&old.published.config[flag(code)]?{...old.published,config:fromLegacy(old.published.config,code),status:'PUBLISHED'}:null;
  return [code,{draft:fromLegacy(old.draft,code),published,history:published?[published]:[],savedAt:old.savedAt||null}];
 })),legacyHistory:old.history||[],updatedBy:old.updatedBy};
}
export function validateCampaign(value,code,{publishing=false}={}){
 checkCode(code);if(!value||typeof value!=='object'||Array.isArray(value))throw fail(400,'Invalid offer settings');
 const source={...initialState().draft,...value,ruleSet:RULE_SET,couponVersion:1,welcomeEnabled:code==='WELCOME250',dressEnabled:code==='GET1',primary:code==='WELCOME250'?value.title:initialState().draft.primary,secondary:code==='GET1'?value.title:initialState().draft.secondary};
 const config=validate(source,{publishing});
 if(publishing&&!value.checkoutEnabled&&!value.landingEnabled)throw fail(400,'Choose checkout or landing-page visibility before publishing');
 return {...fromLegacy(config,code),landingEnabled:value.landingEnabled===true};
}
function live(state,code,phone,now){const revision=state.offers[code].published;if(!revision||revision.status==='PAUSED')return null;const config=validateCampaign(revision.config,code,{publishing:true});return eligible(config,phone,now)?config:null;}
export function checkoutPolicy(value,phone,now){
 const state=independentState(value),welcome=live(state,'WELCOME250',phone,now),dress=live(state,'GET1',phone,now);
 const welcomeEnabled=welcome?.checkoutEnabled===true,dressEnabled=dress?.checkoutEnabled===true;
 if(!welcomeEnabled&&!dressEnabled)return {available:false};
 return {available:true,version:state.version,ruleSet:RULE_SET,couponVersion:1,rules,welcomeEnabled,dressEnabled,eligibleProductIds:dressEnabled?dress.eligibleProductIds:[]};
}
export function landingOffers(value,phone,now){
 if(value?.schema!==3)return publicOffer(value?.published,phone,now);
 const entries=codes.map(code=>live(value,code,phone,now)).filter(c=>c?.landingEnabled);
 if(!entries.length)return {visible:false};
 const ends=entries.map(c=>c.endsAt).filter(Boolean).sort();
 return {visible:true,version:value.version,primary:entries[0].title,secondary:entries[1]?.title||'',terms:entries.map(c=>c.terms).join('\n\n'),endsAt:ends[0]||null};
}
export function hasSelected(value){return codes.some(code=>independentState(value).offers[code].published?.config.audience==='SELECTED');}
export function changeCampaign(value,body,{id,actor,time}){
 const state=independentState(value),code=checkCode(body.offerCode),offer=state.offers[code];
 if(body.action==='save'){offer.draft=validateCampaign(body.draft,code);offer.savedAt=time;}
 else if(body.action==='publish'||body.action==='restore'){
  if(body.confirm!==true)throw fail(400,'Confirm the saved offer and its visibility before publishing');
  const selected=body.action==='restore'?offer.history.find(r=>r.id===body.versionId)?.config:offer.draft;
  if(!selected)throw fail(404,'Offer version not found');
  const config=validateCampaign(selected,code,{publishing:true});
  const revision={id,version:++state.version,config,status:'PUBLISHED',publishedAt:time,actor};
  offer.published=revision;offer.history=[revision,...offer.history].slice(0,20);
 }else if(body.action==='pause'){
  if(offer.published){const revision={...offer.published,id,version:++state.version,status:'PAUSED',pausedAt:time,actor};offer.published=revision;offer.history=[revision,...offer.history].slice(0,20);}
 }else throw fail(400,'Unknown offer action');
 state.updatedBy=actor;return state;
}
