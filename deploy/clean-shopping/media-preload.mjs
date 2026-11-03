// Test container only: freeze public settings without Azure credentials or writes.
import {readFileSync} from 'node:fs';
const fixtures=JSON.parse(readFileSync('/hidi-search-fixtures/public.json','utf8'));
const original=globalThis.fetch.bind(globalThis);
globalThis.fetch=(input,options)=>{
 const url=new URL(typeof input==='string'||input instanceof URL?input:input.url);
 if(['127.0.0.1','localhost'].includes(url.hostname)){
  if(Object.hasOwn(fixtures,url.pathname))return Promise.resolve(new Response(JSON.stringify(fixtures[url.pathname]),{headers:{'content-type':'application/json'}}));
  if(url.pathname.startsWith('/media/products/')||url.pathname.startsWith('/api/hidi/hero-asset/')){
   if(options?.method&&!['GET','HEAD'].includes(options.method))throw Error('Read-only media fixture');
   return original('https://hidiindia.com'+url.pathname,options);
  }
 }
 return original(input,options);
};
