// Node --import preload for the candidate's external services. Candidate image
// files are never edited. Real commerce/storage writes are not possible here.
import {storageFetch,sessionFetch} from './typography-fixture.mjs';
const native=globalThis.fetch;
globalThis.fetch=(url,options)=>{
  const u=new URL(typeof url==='string'||url instanceof URL?url:url.url);
  if(u.hostname==='169.254.169.254'||u.hostname==='typographyfixture.blob.core.windows.net')return storageFetch(u,options);
  if(['localhost','127.0.0.1'].includes(u.hostname)&&u.pathname==='/api/admin/session')return sessionFetch(u,options);
  if(!['localhost','127.0.0.1'].includes(u.hostname))return Promise.resolve(new Response('{}',{status:503}));
  return native(url,options);
};
