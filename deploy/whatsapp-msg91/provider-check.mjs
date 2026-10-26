(async()=>{
  const key=process.env.MSG91_WHATSAPP_AUTHKEY||process.env.MSG91_AUTHKEY||'';
  const r=await fetch('https://control.msg91.com/api/v5/whatsapp/whatsapp-activation/',{headers:{authkey:key,accept:'application/json'},redirect:'error',signal:AbortSignal.timeout(15000)});
  const b=await r.json();
  const safe=JSON.stringify(b).replaceAll(key,'[redacted]');
  const classifications={ipRestriction:/ip.{0,60}(block|white|allow|invalid|unauthor)|whitelist/i.test(safe),invalidKey:/invalid.{0,20}(auth|key)|auth.{0,20}(invalid|not valid)/i.test(safe),missingKey:/auth.{0,20}(missing|required)|missing.{0,20}(auth|key)/i.test(safe),permissionDenied:/permission|access denied|not authorized|unauthor/i.test(safe)};
  const codes=[];const rows=[];
  function walk(v){if(!v||typeof v!=='object')return;if(Array.isArray(v)){v.forEach(walk);return;}for(const k of ['code','error_code'])if(typeof v[k]==='number'||(typeof v[k]==='string'&&/^[A-Za-z0-9_-]{1,30}$/.test(v[k])))codes.push(v[k]);if(Object.values(v).some(x=>typeof x==='string'&&x.replace(/\D/g,'')==='917093709353')){const row={};for(const k of ['status','is_active','active','waba_id','phone_number_id','integrated_number'])if(['string','number','boolean'].includes(typeof v[k]))row[k]=v[k];rows.push(row);}Object.values(v).filter(x=>x&&typeof x==='object').forEach(walk);}
  walk(b);
  const errorText=[];
  function errors(v){if(typeof v==='string'){errorText.push(v.replaceAll(key,'[redacted]').replace(/[A-Za-z0-9_-]{24,}/g,'[redacted]').slice(0,250));return;}if(v&&typeof v==='object')Object.values(v).forEach(errors);}
  if(!r.ok){errors(b.errors);errors(b.apiError);errors(b.message);}
  console.log('HIDI_DELIVERY_RESULT::'+JSON.stringify({passed:true,readOnly:true,status:r.status,keyPresent:!!key,keySource:process.env.MSG91_WHATSAPP_AUTHKEY?'whatsapp':'shared',keyHasWhitespace:key.trim()!==key,keyMatchesVisibleHint:key.startsWith('5766')&&key.endsWith('7cP1'),codes:[...new Set(codes)],errorText,classifications,matchingNumbers:rows}));
})().catch(()=>console.log('HIDI_DELIVERY_RESULT::'+JSON.stringify({passed:false,code:'PROVIDER_READ_FAILED'})));
