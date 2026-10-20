import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const main='/assets/index-yOknTVcM.css',observations=new WeakMap(),proofs=new Map(),results=[];
const hash=text=>createHash('sha256').update(text).digest('hex');
async function sourceProof(out){
 if(!proofs.has(out)){
  const bytes=await readFile(out+'/critical-css-quality.json'),source=JSON.parse(bytes);
  assert.equal(Object.keys(source.styles).length,8,'Composition must capture all eight original CSS sources');
  assert.equal(source.styles[main]?.sha256,'642ee7cd71456af76aac15c566be39e3360631ce8bd90cbae28faab489b3dac2','Reviewed main CSS must remain external');
  proofs.set(out,{sourceProofSha256:hash(bytes),styles:source.styles});
 }
 return proofs.get(out);
}
export async function observeCompleteCss(page){
 const state={requests:[],documentHeaders:null};observations.set(page,state);
 page.on('request',request=>{
  if(request.isNavigationRequest()&&request.frame()===page.mainFrame())state.documentHeaders=request.headers();
  if(new URL(request.url()).pathname.endsWith('.css'))state.requests.push(request.url());
 });
 await page.addInitScript(()=>{
  window.__HidiProbeCompleteCss=[];
  const capture=()=>{
   for(const node of document.querySelectorAll('style[data-hidi-complete-css="true"]')){
    const sheet=node.sheet,text=node.textContent;
    if(!node.isConnected||!sheet||sheet.disabled||!sheet.cssRules.length)continue;
    if(window.__HidiProbeCompleteCss.some(row=>row.node===node&&row.text===text))continue;
    window.__HidiProbeCompleteCss.push({node,text,appliedAt:performance.now(),rules:sheet.cssRules.length});
   }
  };
  new MutationObserver(capture).observe(document,{childList:true,subtree:true,characterData:true});
  addEventListener('DOMContentLoaded',capture,{once:true});addEventListener('load',capture,{once:true});capture();
 });
 return state;
}
export async function assertCompleteCss(page,out,{group,label,phase='applied',mediaStart=null}={}){
 const proof=await sourceProof(out),observation=observations.get(page);assert(observation?.documentHeaders,'CSS observation must start before navigation');
 const headers=observation.documentHeaders,desktop=Boolean(headers['user-agent'])&&!/Mobile|Android/i.test(headers['user-agent'])&&headers['sec-ch-ua-mobile']!=='?1';
 const snapshot=await page.evaluate(paths=>{
  const resources=performance.getEntriesByType('resource');
  const inline=[...document.querySelectorAll('style[data-hidi-complete-css="true"]')].map(node=>{
   const text=node.textContent,seen=(window.__HidiProbeCompleteCss||[]).find(row=>row.node===node&&row.text===text);
   return {source:node.dataset.hidiInlineCss,claimedHash:node.dataset.hidiSourceSha256,text,applied:Boolean(node.sheet)&&!node.sheet.disabled,rules:node.sheet?.cssRules.length||0,observedText:seen?.text,appliedAt:seen?.appliedAt??null};
  });
  const external=[...document.querySelectorAll('link[data-hidi-deferred-style]')].map(node=>{
   const original=node.dataset.hidiOriginHref||node.dataset.hidiFullHref,source=new URL(original,location.href).pathname;
   const resource=resources.filter(row=>row.name===node.href).sort((a,b)=>b.responseEnd-a.responseEnd)[0];
   return {source,url:node.href,fullUrl:new URL(node.dataset.hidiFullHref,location.href).href,applied:Boolean(node.sheet)&&node.media==='all',sheet:Boolean(node.sheet),media:node.media,responseEnd:resource?.responseEnd??null};
  });
  const sourceOrder=[...document.querySelectorAll('style[data-hidi-inline-css]')].filter(node=>paths.includes(node.dataset.hidiInlineCss)).map(node=>node.dataset.hidiInlineCss);
  return {inline,external,sourceOrder};
 },Object.keys(proof.styles));
 assert.deepEqual(snapshot.sourceOrder,Object.keys(proof.styles),'All eight source cascade positions must retain their captured order');
 const expectedInline=desktop?Object.keys(proof.styles).filter(path=>path!==main):[];
 assert.deepEqual(snapshot.inline.map(row=>row.source).sort(),expectedInline.slice().sort(),'Selected desktop response must contain exactly the seven full inline sources; mobile retains external delivery');
 const covered=[...snapshot.inline,...snapshot.external].map(row=>row.source);
 assert.deepEqual(covered.slice().sort(),Object.keys(proof.styles).sort(),'Every complete CSS source must be covered exactly once');
 assert.equal(snapshot.external.length,desktop?1:8);assert(snapshot.external.some(row=>row.source===main),'The main stylesheet must remain a real external sheet');
 for(const row of snapshot.inline){
  const source=proof.styles[row.source];assert.equal(hash(row.text),source.sha256,'Full inline text must equal captured original CSS: '+row.source);assert.equal(hash(row.observedText||''),source.sha256,'Independently observed applied text must equal original CSS');assert.equal(row.claimedHash,source.sha256);
  assert(row.applied&&row.rules>0&&row.appliedAt>0,'Full inline CSS must have a real stylesheet and observed application time');
  if(mediaStart!==null)assert(row.appliedAt<=mediaStart,'Every inline stylesheet must be observed applied before video starts');
  const mirrorPath='/assets/style-'+source.sha256.slice(0,16)+'.css';assert(!observation.requests.some(url=>[row.source,mirrorPath].includes(new URL(url).pathname)),'Full inline sources must not be downloaded again: '+row.source);
  row.sha256=hash(row.text);row.bytes=Buffer.byteLength(row.text);delete row.text;delete row.observedText;
 }
 for(const row of snapshot.external){
  assert(proof.styles[row.source],'Unknown complete external stylesheet');
  assert(observation.requests.some(url=>url===row.url||url===row.fullUrl),'External CSS must actually be requested');
  if(phase==='pending')assert(!row.applied&&row.media!=='all','Held external CSS must genuinely remain pending');
  else{assert(row.applied&&row.responseEnd>0,'Every external stylesheet must load and apply with a real ResourceTiming');if(mediaStart!==null)assert(row.responseEnd<=mediaStart,'Complete external CSS response must precede video start');}
 }
 const result={group,label,phase,desktopDelivery:desktop,requestProfile:{userAgent:headers['user-agent']||null,mobileHint:headers['sec-ch-ua-mobile']||null},mediaStart,...snapshot,cssRequests:observation.requests.slice()};results.push(result);return result;
}
export async function writeCompleteCssProof(out,mode){
 const proof=await sourceProof(out),initial=results.filter(row=>row.group==='initial'&&row.phase==='applied'),pending=results.filter(row=>row.group==='initial'&&row.phase==='pending'),recovery=results.filter(row=>row.group==='recovery'),videoLabels=['Desktop full-css-held','Desktop reduced-motion','Desktop data-saving'];
 assert.equal(initial.length,8);assert.equal(pending.length,8);assert.equal(recovery.length,32);
 const video=results.filter(row=>row.group==='video'&&videoLabels.includes(row.label));assert.equal(video.length,3);
 await writeFile(out+'/complete-css-'+mode+'.json',JSON.stringify({passed:true,sourceProofSha256:proof.sourceProofSha256,sources:Object.fromEntries(Object.entries(proof.styles).map(([path,row])=>[path,row.sha256])),initialCases:initial.length,recoveryCases:recovery.length,desktopVideoCases:video.length,results},null,2));
}
