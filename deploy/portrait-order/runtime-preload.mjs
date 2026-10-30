// Test process only. Never copied into a release image.
const original=globalThis.fetch;
globalThis.fetch=(input,options)=>{
  const url=new URL(typeof input==='string'?input:input.url||input.href);
  if(!['127.0.0.1','localhost'].includes(url.hostname))throw new Error('External candidate traffic forbidden');
  return original(input,options);
};
