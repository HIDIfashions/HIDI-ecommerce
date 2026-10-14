export const audiences = new Set(['HIDDEN', 'SELECTED', 'EVERYONE']);
export const fail = (status, message) => Object.assign(new Error(message), {status});
export function phone(value) {
  if (typeof value !== 'string' || !/^[+\d\s()-]{10,24}$/.test(value)) throw fail(400,'Enter a valid Indian mobile number');
  const digits=value.replace(/\D/g,'');
  const local=digits.length===12&&digits.startsWith('91')?digits.slice(2):digits;
  if (!/^[6-9]\d{9}$/.test(local)) throw fail(400,'Enter a valid Indian mobile number');
  return '+91'+local;
}
export function initialState() {
  return {schema:1,draft:{primary:'15% off your order',secondary:'or a free dress on ₹3,999+',terms:'Choose one offer per order. Offers cannot be combined.',audience:'SELECTED',allowedPhones:[],startsAt:null,endsAt:null},published:null,history:[]};
}
export function validate(value, {publishing=false}={}) {
  if (!value||typeof value!=='object'||Array.isArray(value)) throw fail(400,'Invalid offer settings');
  const result={};
  for(const [key,max]of [['primary',100],['secondary',150],['terms',2000]]) {
    if(typeof value[key]!=='string'||!value[key].trim()||value[key].length>max) throw fail(400,'Complete '+key+' within its text limit');
    result[key]=value[key].trim();
  }
  if(!audiences.has(value.audience))throw fail(400,'Choose a valid audience');
  result.audience=value.audience;
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
  if(!eligible(published?.config,verifiedPhone,now))return {visible:false};
  const {primary,secondary,terms,endsAt}=published.config;
  return {visible:true,version:published.version,primary,secondary,terms,endsAt};
}
