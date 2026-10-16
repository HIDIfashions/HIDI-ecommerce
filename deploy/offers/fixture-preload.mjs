// Used only by the isolated candidate process, never copied to the image.
const original=globalThis.fetch;
globalThis.fetch=(input,options)=>{
  const url=new URL(typeof input==='string'?input:input.url||input.href);
  if(url.hostname==='offerstestfixture.blob.core.windows.net'){
    const local=new URL(process.env.HIDI_OFFERS_FIXTURE);local.pathname='/private-blob'+url.pathname;local.search=url.search;
    return original(local,options);
  }
  if(!['127.0.0.1','localhost'].includes(url.hostname))throw new Error('External server traffic forbidden in the offer fixture');
  return original(input,options);
};
