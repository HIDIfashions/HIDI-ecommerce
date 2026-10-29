export const audiences = new Set(['HIDDEN', 'SELECTED', 'EVERYONE']);
export const RULE_SET = 'hidi-welcome-dress-20261029';
export const rules = Object.freeze({welcomeMinimumPaise:149900,welcomeDiscountPaise:25000,dressMinimumPaise:399900,dressPricePaise:100,dressLimit:25});
export const fail = (status, message) => Object.assign(new Error(message), {status});
export function phone(value) {
  if (typeof value !== 'string' || !/^[+\d\s()-]{10,24}$/.test(value)) throw fail(400,'Enter a valid Indian mobile number');
  const digits=value.replace(/\D/g,'');
  const local=digits.length===12&&digits.startsWith('91')?digits.slice(2):digits;
  if (!/^[6-9]\d{9}$/.test(local)) throw fail(400,'Enter a valid Indian mobile number');
  return '+91'+local;
}
export function initialState() {
  return {schema:2,draft:{ruleSet:RULE_SET,couponVersion:1,welcomeEnabled:true,dressEnabled:true,checkoutEnabled:false,eligibleProductIds:[],primary:'WELCOME250: ₹250 off your first ₹1,499 order.',secondary:'GET1: Shop ₹3,999. Pick another dress for ₹1.',terms:'One offer per order, on current selling prices. Sign in with your verified mobile number. Welcome offer: once per new customer. ₹1 dress: first 25 qualifying orders, one per customer, from selected available designs and sizes. Qualifying spend excludes the ₹1 item and delivery. No additional coupons or reward redemption. Payment attempts temporarily reserve an offer place.',audience:'SELECTED',allowedPhones:[],startsAt:null,endsAt:null},published:null,history:[]};
}
// Upgrade only the editable draft; never publish or reuse the old MRP-based collection.
export function editableState(state) {
  if(state.draft?.ruleSet===RULE_SET&&state.draft?.couponVersion===1)return state;
  return {...state,draft:{...initialState().draft,audience:state.draft?.audience||'SELECTED',allowedPhones:state.draft?.allowedPhones||[],eligibleProductIds:state.draft?.ruleSet===RULE_SET?(state.draft.eligibleProductIds||[]):[]},needsOfferReview:true};
}
export function validate(value, {publishing=false}={}) {
  if (!value||typeof value!=='object'||Array.isArray(value)) throw fail(400,'Invalid offer settings');
  const result={};
  result.couponVersion=value.couponVersion===1?1:null;
  result.ruleSet=value.ruleSet===RULE_SET?RULE_SET:null;
  result.welcomeEnabled=value.welcomeEnabled===true;
  result.dressEnabled=value.dressEnabled===true;
  for(const [key,max]of [['primary',100],['secondary',150],['terms',2000]]) {
    if(typeof value[key]!=='string'||!value[key].trim()||value[key].length>max) throw fail(400,'Complete '+key+' within its text limit');
    result[key]=value[key].trim();
  }
  if(!audiences.has(value.audience))throw fail(400,'Choose a valid audience');
  result.audience=value.audience;
  result.checkoutEnabled=value.checkoutEnabled===true;
  if(value.eligibleProductIds!==undefined&&(!Array.isArray(value.eligibleProductIds)||value.eligibleProductIds.length>200||value.eligibleProductIds.some(id=>typeof id!=='string'||!/^[-a-zA-Z0-9_]{1,64}$/.test(id))))throw fail(400,'Choose at most 200 valid offer products');
  result.eligibleProductIds=[...new Set(value.eligibleProductIds||[])];
  if(publishing&&result.checkoutEnabled){
    if(result.ruleSet!==RULE_SET||result.couponVersion!==1)throw fail(400,'Save and review the new offer models before publishing');
    if(!result.welcomeEnabled&&!result.dressEnabled)throw fail(400,'Enable at least one offer');
    if(result.dressEnabled&&!result.eligibleProductIds.length)throw fail(400,'Select the ₹1 dress collection, or disable the dress offer to publish welcome only');
  }
  if(!Array.isArray(value.allowedPhones)||value.allowedPhones.length>50)throw fail(400,'Use at most 50 selected numbers');
  result.allowedPhones=[...new Set(value.allowedPhones.map(phone))];
  if(publishing&&result.audience==='SELECTED'&&!result.allowedPhones.length)throw fail(400,'Add your verified login number before publishing a selected-number test');
  for(const key of ['startsAt','endsAt']) {
    const date=value[key];
    if(date!==null&&date!==''&&date!==undefined&&(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(date)||!Number.isFinite(Date.parse(date))||new Date(date).toISOString().slice(0,10)!==date.slice(0,10)))throw fail(400,'Enter a valid '+key+' date');
    result[key]=date?new Date(date).toISOString():null;
  }
  if(result.startsAt&&result.endsAt&&Date.parse(result.endsAt)<=Date.parse(result.startsAt))throw fail(400,'End date must follow start date');
  return result;
}
export function eligible(config, verifiedPhone, now=Date.now()) {
  if(!config||config.audience==='HIDDEN'||!audiences.has(config.audience))return false;
  if(config.startsAt&&now<Date.parse(config.startsAt)||config.endsAt&&now>=Date.parse(config.endsAt))return false;
  if(config.audience==='EVERYONE')return true;
  if(!verifiedPhone)return false;
  try{return config.allowedPhones.includes(phone(verifiedPhone));}catch{return false;}
}
export function publicOffer(published, verifiedPhone, now) {
  if(published?.config?.ruleSet!==RULE_SET||published?.config?.couponVersion!==1)return {visible:false};
  if(!eligible(published?.config,verifiedPhone,now))return {visible:false};
  const {primary,secondary,terms,endsAt}=published.config;
  if(!published.config.welcomeEnabled&&!published.config.dressEnabled)return {visible:false};
  return {visible:true,version:published.version,primary:published.config.welcomeEnabled?primary:secondary,secondary:published.config.welcomeEnabled&&published.config.dressEnabled?secondary:'',terms,endsAt};
}
