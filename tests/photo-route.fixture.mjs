/** Test fixture only: actual route, parser and authorization; isolated storage/API. */
import {createRequire} from 'node:module';
import {readFile,copyFile,writeFile,mkdir,rm,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {join,resolve} from 'node:path';
import vm from 'node:vm';
import * as streamed from '../apps/web/lib/photo-upload-stream.mjs';
import {authorizePhotoUpload} from '../apps/web/lib/photo-upload-authorize.mjs';
import {persistProductDerivatives} from '../apps/web/lib/product-image-derivative-store.mjs';
import {PERSISTENT_DERIVATIVE_WIDTHS,persistentDerivativeBlobKey} from '../deploy/collection-speed/images.mjs';
const require=createRequire(resolve('apps/web/package.json'));
const ts=require('typescript');
export const {NextRequest}=require('next/server');
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
export async function createPhotoRouteFixture(directory,{apiBase='http://127.0.0.1:4219/v1'}={}){
 const temporary=join(directory,'temporary'),stored=join(directory,'stored');
 await mkdir(temporary,{recursive:true});await mkdir(stored,{recursive:true});
 const state={role:'OWNER',authStatus:200,reauthStatus:200,authChecks:0,ticketStatus:200,ticketRequests:[],metadataStatus:200,reads:0,writes:0,derivativeWrites:0,cleanupCalls:0,metadata:[],files:new Map()};
 const send=async(url,options={})=>{
  if(!String(url).startsWith(apiBase+'/admin/'))throw new Error('Non-fixture API request blocked');
  if(String(url).endsWith('/admin/me'))return new Response(JSON.stringify(state.authStatus===200?{admin:{id:'fixture-staff',role:state.role}}:{message:'Fixture session rejected'}),{status:state.authStatus});
  if(String(url).endsWith('/images/ticket')){const payload=JSON.parse(options.body);state.ticketRequests.push(payload);return new Response(JSON.stringify(state.ticketStatus===200?{token:'fixture-eligibility-token'}:{message:'Fixture target rejected'}),{status:state.ticketStatus});}
  if(/\/images$/.test(String(url))){const payload=JSON.parse(options.body);if(state.metadataStatus===200)state.metadata.push(payload);return new Response(JSON.stringify(state.metadataStatus===200?{ok:true,images:state.metadata}:{message:'Fixture metadata unavailable'}),{status:state.metadataStatus});}
  throw new Error('Unexpected fixture API request: '+url);
 };
 const derivativeContainer={getBlockBlobClient:key=>({
  uploadData:async(bytes,options)=>{
   if(state.files.has(key))throw {statusCode:412};
   const path=join(stored,digest(Buffer.from(key)));await writeFile(path,bytes);state.derivativeWrites++;
   state.files.set(key,{path,sha256:options.metadata?.hidi_source_sha256,size:bytes.length,type:options.blobHTTPHeaders?.blobContentType,metadata:options.metadata});
  },
  getProperties:async()=>{
   const file=state.files.get(key);if(!file)throw {statusCode:404};
   return {contentLength:file.size,contentType:file.type,metadata:file.metadata||{}};
  },
  downloadToBuffer:async()=>{
   const file=state.files.get(key);if(!file)throw {statusCode:404};
   return readFile(file.path);
  },
 })};
 const storage={uploadProductImageFile:async(key,photo,type)=>{
  const bytes=await readFile(photo.path);if(digest(bytes)!==photo.sha256)throw new Error('Fixture source integrity mismatch');
  const existing=state.files.get(key);if(existing&&existing.sha256!==photo.sha256)throw new Error('Conflicting saved image');
  const path=join(stored,digest(Buffer.from(key)));await copyFile(photo.path,path);state.writes++;
  state.files.set(key,{path,sha256:photo.sha256,size:photo.size,type});
  return {url:'/media/'+key,storagePath:'azure://product-media/'+key};
 },ensureProductImageDerivatives:(key,photo)=>persistProductDerivatives(derivativeContainer,key,photo),
 deleteUnattachedProductImage:async key=>{
  state.cleanupCalls++;
  state.files.delete(key);
  for(const width of PERSISTENT_DERIVATIVE_WIDTHS){
   const derivative=persistentDerivativeBlobKey(key,width,'webp');if(derivative)state.files.delete(derivative);
  }
 }};
 const authorizationCalls=new WeakMap();
 const authorizeForFixture=(request,base,headers)=>{
  const call=(authorizationCalls.get(request)||0)+1;authorizationCalls.set(request,call);state.authChecks++;
  const status=call===1?state.authStatus:state.reauthStatus;
  return authorizePhotoUpload(request,base,headers,async(url,options)=>{
   if(String(url).endsWith('/admin/me'))return new Response(JSON.stringify(status===200?{admin:{id:'fixture-staff',role:state.role}}:{message:'Fixture session rejected'}),{status});
   return send(url,options);
  });
 };
 const aliases={'@/lib/azure-blob':storage,'@/lib/api':{API_URL:apiBase},
  '@/lib/photo-upload-stream.mjs':{...streamed,readStreamedPhotoForm:request=>{state.reads++;return streamed.readStreamedPhotoForm(request,{directory:temporary});}},
  '@/lib/photo-upload-authorize.mjs':{authorizePhotoUpload:authorizeForFixture}};
 async function load(file){
  const source=await readFile(resolve(file),'utf8');
  const result=ts.transpileModule(source,{fileName:file,compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}});
  const module={exports:{}};
  // Imported parser/auth errors originate in the host realm. Share Error so the
  // actual route's instanceof check behaves as it does in one application realm.
  // The route, error messages, status codes and browser assertions stay unchanged.
  vm.runInNewContext(result.outputText,{module,exports:module.exports,require:name=>aliases[name]??require(name),process,Buffer,Error,TypeError,fetch:send,AbortSignal,URL,URLSearchParams,Request,Response,Headers,File,FormData,console,setTimeout,clearTimeout},{filename:file});
  return module.exports;
 }
 aliases['@/lib/admin-auth']=await load('apps/web/lib/admin-auth.ts');
 aliases['@/middleware']=await load('apps/web/middleware.ts');
 const route=await load('apps/web/app/api/admin/inventory/[variantId]/images/route.ts');
 return {route,state,temporary,send,NextRequest,assertClean:async()=>{if((await readdir(temporary)).length)throw new Error('Temporary upload files remain');},cleanup:()=>rm(directory,{recursive:true,force:true})};
}
