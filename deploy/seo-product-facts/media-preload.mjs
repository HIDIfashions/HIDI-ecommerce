// Candidate-container only: use the unchanged, already-public media origin
// where Azure managed identity is unavailable. The production overlay never
// includes this file. The real wrapper still handles security/index headers.
import '/merchant-feed/media-preload.mjs';
import http from 'node:http';
import https from 'node:https';
import {syncBuiltinESMExports} from 'node:module';
import {readFileSync} from 'node:fs';
const allowed=new Set(JSON.parse(readFileSync(new URL('./image-audit.json',import.meta.url),'utf8')).results.map(r=>r.path));
const original=http.request;
http.request=function(options,...args){
 if(options&&options.hostname==='127.0.0.1'&&String(options.port)==='3001'&&allowed.has(options.path)){
  if(!['GET','HEAD'].includes(options.method))throw Error('Read-only product-media fixture');
  const headers={...options.headers};delete headers.host;delete headers['x-forwarded-host'];
  return https.request({...options,protocol:'https:',hostname:'hidiindia.com',port:443,headers},...args);
 }
 return original.call(this,options,...args);
};
syncBuiltinESMExports();
