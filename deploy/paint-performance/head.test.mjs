import test from 'node:test';import assert from 'node:assert/strict';import {mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';import {createHash} from 'node:crypto';import {createHomeHead} from './head.mjs';
import {runInNewContext} from 'node:vm';

test('complete CSS waits for the native poster and automatically starts when native markup is unavailable',async()=>{const app=mkdtempSync(join(tmpdir(),'hidi-style-priority-')),root=join(app,'dist');try{mkdirSync(root);mkdirSync(join(app,'paint-performance'));const css='body{color:red}.later{color:blue}',sha256=createHash('sha256').update(css).digest('hex');writeFileSync(join(root,'a.css'),css);writeFileSync(join(app,'paint-performance/critical-css.json'),JSON.stringify({styles:{'/a.css':{sha256,critical:'body{color:red}'}}}));const html=createHomeHead(root,app)('<head><link rel="stylesheet" href="/a.css"></head><body></body>'),script=html.match(/<script data-hidi-full-css="true">([\s\S]*?)<\/script>/)[1];assert(html.includes('data-hidi-full-href="/a.css?hidi_full='));assert(!/<link\b[^>]*\shref=/.test(html));for(const native of [true,false]){let requests=0;const listeners={},link={dataset:{hidiFullHref:'/a.css?hidi_full='+sha256.slice(0,16)},addEventListener:(name,fn)=>listeners[name]=fn,set href(value){assert.equal(value,this.dataset.hidiFullHref);requests++;}},context={window:{},document:{readyState:native?'loading':'interactive',querySelectorAll:()=>[link],querySelector:()=>native?{}:null,addEventListener:()=>{}}};runInNewContext(script,context);assert.equal(requests,native?0:1);context.window.__HidiLoadFullCss();assert.equal(requests,1);listeners.load();await context.window.__HidiFullCssReady;assert.equal(link.media,'all');context.window.__HidiLoadFullCss();assert.equal(requests,1);}}finally{rmSync(app,{recursive:true,force:true});}});

test('prepared logo and SEO assets require matching source and immutable content hashes',()=>{
 const app=mkdtempSync(join(tmpdir(),'hidi-head-assets-')),root=join(app,'dist'),hash=value=>createHash('sha256').update(value).digest('hex');
 try{for(const folder of ['assets/images','media-performance/assets'])mkdirSync(join(root,folder),{recursive:true});mkdirSync(join(app,'paint-performance'));
 const original=Buffer.from('reviewed-original-logo'),optimized=Buffer.from('same-reviewed-pixels'),code='window.__hidiSeo="original";',logo='/media-performance/assets/logo-'+hash(optimized).slice(0,16)+'.png',seo='/assets/home-seo-'+hash(code).slice(0,16)+'.js';
 writeFileSync(join(root,'assets/images/hidi-logo.png'),original);writeFileSync(join(root,logo),optimized);writeFileSync(join(root,seo),code);writeFileSync(join(app,'paint-performance/head-assets.json'),JSON.stringify({logo:{url:logo,sourceSha256:hash(original),sha256:hash(optimized)},seo:{url:seo,sha256:hash(code)}}));
 const html='<head><script data-hidi-seo-identity="1">'+code+'</script><link rel="preload" as="image" fetchpriority="high" href="/assets/images/hidi-logo.png"></head><body><img src="/assets/images/hidi-logo.png"></body>';
 let output=createHomeHead(root,app)(html);assert(output.includes('defer src="'+seo+'"'));assert(!output.includes(code));assert(output.includes('data:image/png;base64,'+optimized.toString('base64')));assert(!output.includes('rel="preload"'));
 writeFileSync(join(root,seo),'corrupt');writeFileSync(join(root,logo),'corrupt');output=createHomeHead(root,app)(html);assert(output.includes(code));assert(output.includes('data:image/png;base64,'+original.toString('base64')));
 const changed=html.replace(code,'window.__hidiSeo="updated";');assert(createHomeHead(root,app)(changed).includes('window.__hidiSeo="updated";'));
 }finally{rmSync(app,{recursive:true,force:true});}
});
test('public CSS retains cascade order, markers and asset URL resolution; remote/imported/conditional styles remain links',()=>{
 const root=mkdtempSync(join(tmpdir(),'hidi-head-'));
 try{
  mkdirSync(join(root,'assets'));writeFileSync(join(root,'assets/one.css'),'.a{background:url(../image.webp)}');writeFileSync(join(root,'two.css'),'.a{color:red}');writeFileSync(join(root,'import.css'),'@import "other.css";');
  const input='<link rel="stylesheet" data-marker href="/assets/one.css"><link rel="stylesheet" href="/two.css"><link rel="stylesheet" href="https://other.example/a.css"><link rel="stylesheet" media="print" href="/two.css"><link rel="stylesheet" href="/import.css">';
  const result=createHomeHead(root)(input);
  assert(result.includes('data-marker=""'));assert(result.includes('url("/image.webp")'));assert(result.indexOf('background')<result.indexOf('color:red'));assert(result.includes('href="https://other.example/a.css"'));assert(result.includes('media="print"'));assert(result.includes('href="/import.css"'));
 }finally{rmSync(root,{recursive:true,force:true});}
});
test('future image overlays supply fresh CSS and unavailable or unsafe paths fall back',()=>{
 const root=mkdtempSync(join(tmpdir(),'hidi-head-'));try{
  const link='<link rel="stylesheet" href="/a.css">';writeFileSync(join(root,'a.css'),'a{color:red}');assert(createHomeHead(root)(link).includes('color:red'));writeFileSync(join(root,'a.css'),'a{color:blue}');assert(createHomeHead(root)(link).includes('color:blue'));assert.equal(createHomeHead(root)('<link rel="stylesheet" href="/missing.css">'),'<link rel="stylesheet" href="/missing.css">');
 }finally{rmSync(root,{recursive:true,force:true});}
});
test('app stays external and preloaded so the parser can paint the header sooner; config retains execution order',()=>{
 const root=mkdtempSync(join(tmpdir(),'hidi-head-'));try{
  mkdirSync(join(root,'assets'));writeFileSync(join(root,'assets/index-abc.js'),'globalThis.app="</script>";');writeFileSync(join(root,'config.js'),'window.HIDI_CONFIG={siteUrl:"/"};');
  const input='<link rel="modulepreload" href="/assets/index-abc.js"><script type="module" crossorigin src="/assets/index-abc.js"></script><div id="root"></div><script src="./config.js?v=one"></script>';
  const result=createHomeHead(root)(input);assert(result.includes('modulepreload'));assert(result.includes('type="module"'));assert(result.includes('src="/assets/index-abc.js"'));assert(!result.includes('globalThis.app='));assert(result.includes('data-hidi-inline-script="/config.js"'));assert(result.indexOf('id="root"')<result.indexOf('window.HIDI_CONFIG'));assert(!result.includes('src="./config.js'));
  writeFileSync(join(root,'assets/index-split.js'),'import x from "./chunk.js";');const split='<script type="module" src="/assets/index-split.js"></script>';assert.equal(createHomeHead(root)(split),split);
 }finally{rmSync(root,{recursive:true,force:true});}
});
test('parser header logo embeds exact bytes while external app loading is preserved',()=>{
 const root=mkdtempSync(join(tmpdir(),'hidi-logo-'));try{
  mkdirSync(join(root,'assets/images'),{recursive:true});const logo=Buffer.from([137,80,78,71,13,10,26,10]);writeFileSync(join(root,'assets/images/hidi-logo.png'),logo);
  writeFileSync(join(root,'assets/index-abc.js'),'const x={src:Tt("images/hidi-logo.png"),fetchPriority:"high"};');
  const html='<link rel="preload" as="image" href="./assets/images/hidi-logo.png"><script type="module" src="/assets/index-abc.js"></script><header><img src="./assets/images/hidi-logo.png"></header>';
  const result=createHomeHead(root)(html),data='data:image/png;base64,'+logo.toString('base64');assert.equal(result.split(data).length,2);assert(!result.includes('href="./assets/images/hidi-logo.png"'));assert(!result.includes('src:Tt('));assert.equal(Buffer.from(result.match(/<img src="data:image\/png;base64,([^"]+)"/)[1],'base64').compare(logo),0);
 }finally{rmSync(root,{recursive:true,force:true});}
});

test('sized favicons retain Apple/PWA declarations and stale branding metadata is ignored',()=>{
 const app=mkdtempSync(join(tmpdir(),'hidi-icons-')),root=join(app,'dist');try{
  mkdirSync(root);mkdirSync(join(app,'paint-performance'));const source=Buffer.from('current-icon-frames');writeFileSync(join(root,'brand.ico'),source);
  const markup='<link rel="icon" type="image/png" sizes="32x32" href="/media-performance/assets/icon-exact-32.png">';writeFileSync(join(app,'paint-performance/icons.json'),JSON.stringify({sourceFile:'dist/brand.ico',originalSha256:createHash('sha256').update(source).digest('hex'),markup}));
  const input='<link rel="shortcut icon" href="/brand.ico"><link rel="icon" href="/other.png"><link rel="apple-touch-icon" href="/touch.png"><link rel="manifest" href="/site.webmanifest">';const output=createHomeHead(root,app)(input);
  assert(output.startsWith(markup));assert(!output.includes('/brand.ico'));assert(!output.includes('/other.png'));assert(output.includes('href="/touch.png"'));assert(output.includes('href="/site.webmanifest"'));
  writeFileSync(join(root,'brand.ico'),'updated-brand');assert.equal(createHomeHead(root,app)(input),input);
 }finally{rmSync(app,{recursive:true,force:true});}
});

test('homepage pricing gets a scoped module while the original commerce file stays exact; changed versions fall back',()=>{
 const app=mkdtempSync(join(tmpdir(),'hidi-home-price-')),root=join(app,'dist'),url='/assets/home-pricing-0123456789abcdef.js',original='export const pricing="reviewed";\n',home='export const homeOnly=true;\n',hash=value=>createHash('sha256').update(value).digest('hex');
 try{mkdirSync(join(root,'assets'),{recursive:true});mkdirSync(join(app,'pricing'));mkdirSync(join(app,'paint-performance'));writeFileSync(join(app,'pricing/storefront.mjs'),original);writeFileSync(join(root,url.slice(1)),home);writeFileSync(join(app,'paint-performance/home-pricing.json'),JSON.stringify({url,sourceSha256:hash(original),homeSha256:hash(home)}));
 const input='<script type="module" data-hidi-pricing-loader src="/pricing-assets/storefront.mjs"></script>',result=createHomeHead(root,app)(input);assert(result.includes('src="'+url+'"'));assert(result.includes('data-hidi-pricing-loader'));assert(!result.includes('src="/pricing-assets/storefront.mjs"'));
 writeFileSync(join(app,'pricing/storefront.mjs'),original+'// later reviewed release');assert.equal(createHomeHead(root,app)(input),input);
 writeFileSync(join(app,'pricing/storefront.mjs'),original);writeFileSync(join(root,url.slice(1)),home+'// changed');assert.equal(createHomeHead(root,app)(input),input);
 }finally{rmSync(app,{recursive:true,force:true});}
});

test('critical styles retain their full sheet and cascade position; changed CSS uses complete inline fallback',()=>{
 const app=mkdtempSync(join(tmpdir(),'hidi-critical-')),root=join(app,'dist');try{
  mkdirSync(join(root,'assets'),{recursive:true});mkdirSync(join(app,'paint-performance'));
  const css='header{color:red}footer{color:blue}',critical='header{color:red}';writeFileSync(join(root,'assets/index-test.css'),css);
  const metadata={styles:{'/assets/index-test.css':{sha256:createHash('sha256').update(css).digest('hex'),critical}}};writeFileSync(join(app,'paint-performance/critical-css.json'),JSON.stringify(metadata));
  const html='<head><link rel="stylesheet" href="/assets/index-test.css" /><style>header{padding:2px}</style></head><body><header>Same design</header></body>';
  const result=createHomeHead(root,app)(html);assert(result.includes('>'+critical+'</style>'));assert(result.includes('rel="stylesheet"'));assert(result.includes('window.__HidiFullCssReady'));assert(result.indexOf('>'+critical+'</style>')<result.indexOf('padding:2px'));assert(result.includes('media="print"'));assert(result.includes('fetchpriority="low"'));assert(result.includes('hidi_full='+metadata.styles['/assets/index-test.css'].sha256.slice(0,16)));assert(!result.includes('<template'));assert(!result.includes('footer{color:blue}'));
  writeFileSync(join(root,'assets/index-test.css'),'header{color:green}footer{color:purple}');const fresh=createHomeHead(root,app)(html);assert(fresh.includes('color:purple'));assert(!fresh.includes('data-hidi-deferred-style'));assert(!fresh.includes('__HidiFullCssReady'));
 }finally{rmSync(app,{recursive:true,force:true});}
});
