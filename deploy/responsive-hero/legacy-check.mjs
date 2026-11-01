import assert from 'node:assert/strict';
import {readFile,writeFile,unlink} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
const root=resolve(process.argv[2]);
const before=await import(pathToFileURL(root+'/baseline/paint-performance/hero.mjs').href),after=await import(pathToFileURL(root+'/candidate/paint-performance/hero.mjs').href);
const html='<header data-hidi-first-header>HIDI</header>',video={type:'video',assetId:'v',url:'/api/hidi/hero-asset/brand/hero/media/video.mp4'},image={type:'image',assetId:'d',url:'/api/hidi/hero-asset/brand/hero/media/desktop.png'};
const options={videos:{[video.url]:{desktop:{url:video.url},mobile:{url:video.url}}},template:'<video data-hidi-first-hero style="--desktop:__DESKTOP__;--mobile:__MOBILE__"></video>'};
const selection={active:true,autoPlay:true,intervalSeconds:6,...video,items:[video,image]};
assert.equal(after.renderHero(html,selection,options),before.renderHero(html,selection,options),'Legacy server bootstrap stays byte-identical');
selection.items[1]={...image,mobileAssetId:'m',mobileUrl:'/api/hidi/hero-asset/brand/hero/media/mobile.png'};
const rendered=after.renderHero(html,selection,options);assert(rendered.includes('"mobileAssetId":"m","mobileUrl":"/api/hidi/hero-asset/brand/hero/media/mobile.png"'),'Video-first bootstrap preserves later mobile artwork');
const target=new URL('../hero-image-loop/responsive-regression-temp.mjs',import.meta.url);
let source=await readFile(new URL('../hero-image-loop/regression.mjs',import.meta.url),'utf8');
source=source.replace("from './preview.mjs'","from '../responsive-hero/preview.mjs'").replace("out=join(root,'results')","out=join(root,'results/legacy')");await writeFile(target,source);
try{const result=spawnSync(process.execPath,[fileURLToPath(target),root],{stdio:'inherit'});assert.equal(result.status,0,'Retained hero video/image regression');}finally{await unlink(target);}
