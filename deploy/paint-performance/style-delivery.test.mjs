import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync,mkdtempSync,mkdirSync,writeFileSync,rmSync,unlinkSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';import {createHash} from 'node:crypto';import {runInNewContext} from 'node:vm';
import {normalizeStyleUrls} from './style-urls.mjs';import {createHomeHead} from './head.mjs';
import {desktopInlineStyles} from './desktop-inline-styles.mjs';
import {smallCssFixture,smallSources,unchangedHeaders} from './fixtures/small-css-fixture.mjs';
import {spawnSync} from 'node:child_process';import {fileURLToPath} from 'node:url';
const hash=value=>createHash('sha256').update(value).digest('hex');

test('seven reviewed desktop sheets inline complete exact bytes at their original cascade positions; main stays external',()=>{
 const f=smallCssFixture();try{
  assert.deepEqual(Object.keys(desktopInlineStyles),Object.keys(smallSources));assert(Object.isFrozen(desktopInlineStyles));
  const output=createHomeHead(f.root,f.app)(f.html,{headers:{'user-agent':'Desktop browser'}});
  assert.equal((output.match(/data-hidi-complete-css="true"/g)||[]).length,7);
  for(const [href,css] of Object.entries(smallSources)){
   const reviewed=desktopInlineStyles[href],index=Object.keys(f.source).indexOf(href);
   assert(Object.isFrozen(reviewed));assert.equal(hash(css),reviewed.sha256);assert.equal(Buffer.byteLength(css),reviewed.bytes);assert(reviewed.bytes<=5500);assert(!/@import|@font-face|url\(/i.test(css));
   const exact='<style data-hidi-inline-css="'+href+'" data-hidi-complete-css="true" data-hidi-source-sha256="'+reviewed.sha256+'" data-fixture="'+index+'">'+css+'</style>';
   assert(output.includes(exact+'<style data-gap="'+index+'">'),'Complete source must occupy precisely its original cascade position: '+href);
   assert(!output.includes('data-hidi-full-href="'+f.origin+f.styles[href].url+'"'),'Small sheet must not also remain an external request');
   assert.equal(readFileSync(f.sourceFile(href),'utf8'),css,'Original source must remain byte-identical');
  }
  for(const href of ['/assets/index-test.css','/assets/unreviewed.css']){
   assert(output.includes('data-hidi-full-href="'+f.origin+f.styles[href].url+'"'));assert(output.includes('data-hidi-origin-href="'+href+'?hidi_full='));
   assert(!output.includes('>'+f.source[href]+'</style>'),'Large main and arbitrary small sources retain their external full sheets');
  }
  assert.equal((output.match(/data-hidi-deferred-style="true"/g)||[]).length,2);assert(output.includes('window.__HidiFullCssReady'));
 }finally{f.close();}
});

test('mobile, client-hint and unknown clients preserve exact pre-change HTML bytes',()=>{
 const f=smallCssFixture();try{
  // Captured with the unchanged a6eb552 head implementation, before this branch
  // was introduced. Normalize only platform checkout line endings; fixture and
  // inline loader content remain intentionally covered by the complete hash.
  const prior='5df76e5f81624e593984680be79b37cfc0e85b1c1a6a15e34d0e77555cede0b9';
  for(const headers of unchangedHeaders){const output=createHomeHead(f.root,f.app)(f.html,{headers});assert.equal(hash(output.replace(/\r\n/g,'\n')),prior,JSON.stringify(headers));assert(!output.includes('data-hidi-complete-css'));}
 }finally{f.close();}
});

for(const scenario of ['missing-mirror','missing-style','stale-style','tampered-mirror','changed-source','changed-source-and-proof','missing-source','missing-critical','unsafe-import','unsafe-style-end','conditional','incomplete-head'])test('small desktop CSS preserves existing fallback for '+scenario,()=>{
 const f=smallCssFixture();try{
  const href=Object.keys(smallSources)[0],css=smallSources[href];let html=f.html,changed=css+'\n.changed{color:green}';
  if(scenario==='missing-mirror')unlinkSync(join(f.app,'paint-performance/asset-mirror.json'));
  if(scenario==='missing-style'){delete f.styles[href];f.writeMetadata();}
  if(scenario==='stale-style'){f.styles[href].sourceSha256='0'.repeat(64);f.writeMetadata();}
  if(scenario==='tampered-mirror')writeFileSync(join(f.root,f.styles[href].url),'tampered');
  if(scenario==='changed-source')writeFileSync(f.sourceFile(href),changed);
  if(scenario==='changed-source-and-proof'){
   writeFileSync(f.sourceFile(href),changed);const sha256=hash(changed),url='/assets/style-'+sha256.slice(0,16)+'.css';writeFileSync(join(f.root,url),changed);
   f.critical[href].sha256=sha256;f.styles[href]={sourceSha256:sha256,url,sha256,bytes:Buffer.byteLength(changed)};f.files[url]=sha256;f.writeMetadata();
  }
  if(scenario==='missing-source')unlinkSync(f.sourceFile(href));
  if(scenario==='missing-critical'){delete f.critical[href];f.writeMetadata();}
  if(scenario==='unsafe-import')writeFileSync(f.sourceFile(href),'@import "another.css";'+css);
  if(scenario==='unsafe-style-end')writeFileSync(f.sourceFile(href),css+'</style>');
  if(scenario==='conditional')html=html.replace('href="'+href+'"','media="print" href="'+href+'"');
  if(scenario==='incomplete-head')html=html.replace('</head>','');
  const output=createHomeHead(f.root,f.app)(html,{headers:{'user-agent':'Desktop browser'}});
  assert(!output.includes('data-hidi-inline-css="'+href+'" data-hidi-complete-css='),'Unverified or conditional source must not use the optimized complete-inline branch');
  if(['missing-mirror','missing-style','stale-style','tampered-mirror'].includes(scenario))assert(output.includes('data-hidi-full-href="'+href+'?hidi_full='),'Unverified mirror retains original deferred source');
  if(scenario==='changed-source'){assert(output.includes('>'+changed+'</style>'));assert(!output.includes('data-hidi-full-href="'+f.origin+f.styles[href].url+'"'));}
  if(scenario==='changed-source-and-proof'){assert(output.includes('data-hidi-full-href="'+f.origin+f.styles[href].url+'"'));assert(!output.includes('>'+css+'</style>'),'Fresh verified but unreviewed version must not inline stale CSS');}
  if(['missing-source','unsafe-import','unsafe-style-end','conditional'].includes(scenario))assert(output.includes('href="'+href+'"'),'Original LINK survives when current safe CSS cannot be transformed');
  if(['missing-critical','incomplete-head'].includes(scenario))assert(output.includes('>'+css+'</style>'),'Existing complete-current-source fallback remains available');
 }finally{f.close();}
});

test('seven inline sheets cannot introduce an unused CSS-edge preconnect or bypass media/integrity exclusions',()=>{
 const f=smallCssFixture();try{
  const edgeOrigin='https://hidi-performance-posters.pages.dev',edgeFiles=Object.fromEntries(Object.keys(smallSources).map(href=>[f.styles[href].url,f.styles[href].sha256]));
  writeFileSync(join(f.app,'paint-performance/asset-mirror.json'),JSON.stringify({passed:true,bootOnce:true,origin:f.origin,files:f.files,edgeOrigin,edgeFiles}));
  const output=createHomeHead(f.root,f.app)(f.html,{headers:{'user-agent':'Desktop browser'}});
  assert(!output.includes('<link rel="preconnect" href="'+edgeOrigin+'" crossorigin>'),'Only actually external stylesheet origins create anonymous preconnects');
  const href=Object.keys(smallSources)[0];
  for(const attribute of ['media="print"','disabled="disabled"','integrity="sha256-existing"']){
   const html=f.html.replace('href="'+href+'"',attribute+' href="'+href+'"'),result=createHomeHead(f.root,f.app)(html,{headers:{'user-agent':'Desktop browser'}});
   assert(result.includes(attribute+' href="'+href+'"'));assert(!result.includes('data-hidi-inline-css="'+href+'" data-hidi-complete-css='));
  }
 }finally{f.close();}
});
test('CDN stylesheet URLs retain original HIDI fonts, query strings, fragments and remote/data resources',()=>{
 const css='a{background:url(../photos/a.webp?v=2#x)}@font-face{src:url(/fonts/a.woff2)}b{filter:url(#filter);background:url(data:image/png;base64,YWJj)}c{background:url(https://images.example/a.jpg)}';
 const result=normalizeStyleUrls(css,'/assets/one.css',true);assert(result.includes('url("https://hidiindia.com/photos/a.webp?v=2#x")'));assert(result.includes('url("https://hidiindia.com/fonts/a.woff2")'));assert(result.includes('url(#filter)'));assert(result.includes('url(data:image/png;base64,YWJj)'));assert(result.includes('url(https://images.example/a.jpg)'));
 assert.equal(normalizeStyleUrls('a{background:url("../photos/my photo.webp?v=2")}','/assets/one.css',true),'a{background:url("https://hidiindia.com/photos/my%20photo.webp?v=2")}');
});
test('builder preserves original CSS and rejects stale source metadata before publication',()=>{
 const folder=mkdtempSync(join(tmpdir(),'hidi-css-build-')),base=join(folder,'base'),overlay=join(folder,'overlay'),href='/assets/a.css',css='header{color:red;background:url(../a.webp)}',sourceSha256=hash(normalizeStyleUrls(css,href));
 try{
  mkdirSync(join(base,'dist/assets'),{recursive:true});mkdirSync(join(overlay,'paint-performance'),{recursive:true});writeFileSync(join(base,'dist'+href),css);writeFileSync(join(overlay,'paint-performance/critical-css.json'),JSON.stringify({styles:{[href]:{sha256:sourceSha256}}}));
  const run=()=>spawnSync(process.execPath,[fileURLToPath(new URL('./build-styles.mjs',import.meta.url)),base,overlay],{encoding:'utf8'});
  const result=run();assert.equal(result.status,0,result.stderr);const row=JSON.parse(readFileSync(join(overlay,'paint-performance/style-assets.json'),'utf8')).styles[href];assert.equal(row.sourceSha256,sourceSha256);const encoded=readFileSync(join(overlay,'dist'+row.url),'utf8');assert.equal(hash(encoded),row.sha256);assert.equal(encoded,normalizeStyleUrls(css,href,true));assert.equal(readFileSync(join(base,'dist'+href),'utf8'),css);
  writeFileSync(join(base,'dist'+href),css+'header{color:green}');assert.notEqual(run().status,0);
 }finally{rmSync(folder,{recursive:true,force:true});}
});
test('desktop stylesheet delivery requires current CSS and matching immutable bytes; phones retain original delivery',()=>{
 const app=mkdtempSync(join(tmpdir(),'hidi-style-mirror-')),root=join(app,'dist'),css='header{color:red}footer{background:url(/photo.webp)}',critical='header{color:red}',source=hash(css),encoded=normalizeStyleUrls(css,'/assets/index-old.css',true),sha256=hash(encoded),url='/assets/style-'+sha256.slice(0,16)+'.css',origin='https://hidi-test.azurestaticapps.net';
 try{
  mkdirSync(join(root,'assets'),{recursive:true});mkdirSync(join(app,'paint-performance'));writeFileSync(join(root,'assets/index-old.css'),css);writeFileSync(join(root,url),encoded);
  writeFileSync(join(app,'paint-performance/critical-css.json'),JSON.stringify({styles:{'/assets/index-old.css':{sha256:source,critical}}}));writeFileSync(join(app,'paint-performance/style-assets.json'),JSON.stringify({styles:{'/assets/index-old.css':{sourceSha256:source,url,sha256}}}));writeFileSync(join(app,'paint-performance/asset-mirror.json'),JSON.stringify({passed:true,bootOnce:true,origin,files:{[url]:sha256}}));
  const html='<head><link rel="stylesheet" data-example="kept" href="/assets/index-old.css"><style>footer{color:blue}</style></head><body></body>',desktop={headers:{'user-agent':'Mozilla/5.0 Windows'}},output=createHomeHead(root,app)(html,desktop);
  assert(output.includes('data-hidi-full-href="'+origin+url+'"'));assert(output.includes('data-hidi-origin-href="/assets/index-old.css?hidi_full='+source.slice(0,16)+'"'));assert(output.includes('integrity="sha256-'+Buffer.from(sha256,'hex').toString('base64')+'"'));assert(output.includes('data-example="kept"'));assert(!output.includes('>'+encoded+'</style>'));
  assert(!createHomeHead(root,app)(html,{headers:{'user-agent':'Android Mobile'}}).includes('data-hidi-origin-href'));
  writeFileSync(join(root,url),'tampered');assert(!createHomeHead(root,app)(html,desktop).includes('data-hidi-origin-href'));
  writeFileSync(join(root,url),encoded);writeFileSync(join(root,'assets/index-old.css'),css+'footer{color:green}');const changed=createHomeHead(root,app)(html,desktop);assert(!changed.includes('data-hidi-origin-href'));assert(changed.includes('color:green'));
 }finally{rmSync(app,{recursive:true,force:true});}
});
test('desktop anonymous CSS preconnects follow actual verified style origins and deduplicate the app connection',()=>{
 const app=mkdtempSync(join(tmpdir(),'hidi-css-preconnect-')),root=join(app,'dist'),origin='https://hidi-test.azurestaticapps.net',edgeOrigin='https://hidi-performance-posters.pages.dev';
 const js='if (!window.__HidiAppStarted) {window.__HidiAppStarted=true;}',scriptPath='/assets/index-'+hash(js).slice(0,16)+'.js',desktop={headers:{'user-agent':'Desktop browser'}};
 try{
  mkdirSync(join(root,'assets'),{recursive:true});mkdirSync(join(app,'paint-performance'));writeFileSync(join(root,scriptPath),js);
  const files={[scriptPath]:hash(js)},critical={},styles={};
  for(const name of ['a','b','unused']){const href='/assets/'+name+'.css',css='.'+name+'{color:red}',sha256=hash(css),url='/assets/style-'+sha256.slice(0,16)+'.css';writeFileSync(join(root,href),css);writeFileSync(join(root,url),css);files[url]=sha256;critical[href]={sha256,critical:css};styles[href]={sourceSha256:sha256,url,sha256};}
  const writeStyles=()=>writeFileSync(join(app,'paint-performance/style-assets.json'),JSON.stringify({styles})),writeMirror=edgeFiles=>writeFileSync(join(app,'paint-performance/asset-mirror.json'),JSON.stringify({passed:true,bootOnce:true,origin,edgeOrigin,files,edgeFiles}));
  writeFileSync(join(app,'paint-performance/critical-css.json'),JSON.stringify({styles:critical}));writeStyles();
  const cssFiles=Object.fromEntries(Object.entries(files).filter(([path])=>path.endsWith('.css')));writeMirror(cssFiles);
  const html='<head><meta charset="utf-8"><link rel="modulepreload" href="'+scriptPath+'"><link rel="stylesheet" href="/assets/a.css"><link rel="stylesheet" href="/assets/b.css"><script type="module" src="'+scriptPath+'"></script></head><body></body>',hint='<link rel="preconnect" href="'+edgeOrigin+'" crossorigin>',appHint='<link rel="preconnect" href="'+origin+'" crossorigin>';
  const output=createHomeHead(root,app)(html,desktop);assert.equal(output.split(hint).length,2,'All actual sheets sharing one CSS origin need one anonymous hint');assert.equal(output.split(appHint).length,2);assert(output.indexOf(hint)<output.indexOf('rel="modulepreload"'));assert(output.includes('data-hidi-full-href="'+edgeOrigin+styles['/assets/a.css'].url+'"'));assert(output.includes('media="print" fetchpriority="low" data-hidi-deferred-style="true"'));
  for(const headers of [{},{'user-agent':'Android Mobile'},{'user-agent':'Desktop browser','sec-ch-ua-mobile':'?1'}])assert(!createHomeHead(root,app)(html,{headers}).includes(hint),'Phones and unknown clients retain their original CSS delivery');
  writeMirror(files);assert.equal(createHomeHead(root,app)(html,desktop).split(hint).length,2,'A shared app/CSS origin needs only the existing anonymous app hint');
  writeMirror({[styles['/assets/unused.css'].url]:styles['/assets/unused.css'].sha256});const unused=createHomeHead(root,app)(html,desktop);assert(!unused.includes(hint),'A verified but unused CSS asset must not create a hint');assert.equal(unused.split(appHint).length,2);
  writeMirror(cssFiles);for(const name of ['a','b'])styles['/assets/'+name+'.css'].sourceSha256='0'.repeat(64);writeStyles();const stale=createHomeHead(root,app)(html,desktop);assert(!stale.includes(hint),'Stale style source metadata must not create a CSS hint');assert(stale.includes('data-hidi-full-href="/assets/a.css?hidi_full='));
  for(const name of ['a','b'])styles['/assets/'+name+'.css'].sourceSha256=critical['/assets/'+name+'.css'].sha256;writeStyles();writeFileSync(join(root,styles['/assets/a.css'].url),'tampered');assert(!createHomeHead(root,app)(html,desktop).includes(hint),'Tampered mirrored bytes must not create a CSS hint');
 }finally{rmSync(app,{recursive:true,force:true});}
});
for(const scenario of ['success','error','stalled'])test('full CSS '+scenario+' retains cascade link and recovers only once',async()=>{
 const events={},timers=[],removed=[],link={dataset:{hidiFullHref:'https://hidi-test.azurestaticapps.net/assets/style-aaaaaaaaaaaaaaaa.css',hidiOriginHref:'/assets/original.css'},media:'print',addEventListener:(name,fn)=>events[name]=fn,removeAttribute:name=>removed.push(name)},window={};
 runInNewContext(readFileSync(new URL('./full-css-client.js',import.meta.url),'utf8'),{window,Promise,document:{readyState:'loading',querySelectorAll:()=>[link],addEventListener:()=>{}},setTimeout:fn=>{timers.push(fn);return 1;},clearTimeout:()=>{}});
 window.__HidiLoadFullCss();window.__HidiLoadFullCss();assert.equal(link.href,link.dataset.hidiFullHref);assert.equal(timers.length,1);
 if(scenario!=='success'){if(scenario==='error')events.error();else timers[0]();assert.equal(link.href,link.dataset.hidiOriginHref);assert.deepEqual(removed,['integrity','crossorigin']);}
 events.load();await window.__HidiFullCssReady;assert.equal(link.media,'all');events.error();assert.equal(timers.length,1);
});
