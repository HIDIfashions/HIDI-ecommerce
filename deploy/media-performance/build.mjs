import {readFile,writeFile,mkdir,readdir,stat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {resolve,join} from 'node:path';
import {spawnSync} from 'node:child_process';
const work=resolve(process.env.RUNNER_TEMP,'hidi-media-private'),base=join(work,'web/base-app'),overlay=join(work,'web/overlay');
const out=join(overlay,'dist/media-performance/assets');await mkdir(out,{recursive:true});await mkdir(join(work,'sources'),{recursive:true});
const require=createRequire(join(base,'apps/web/server.js')),sharp=require('next/dist/server/image-optimizer.js').getSharp(1,false);
const selections=JSON.parse(await readFile(join(work,'selections.json'),'utf8'));
const manifest={images:{},videos:{}},report={images:[],videos:[]},originals={};
const hash=b=>createHash('sha256').update(b).digest('hex').slice(0,16);
const pathOf=s=>new URL(s,'https://hidiindia.com').pathname;
async function bytes(url){
 const pathname=pathOf(url);if(pathname.startsWith('/assets/'))return readFile(join(base,'dist',pathname));
 if(!pathname.startsWith('/api/hidi/hero-asset/'))throw Error('Unapproved media source');
 const r=await fetch('https://hidiindia.com'+pathname,{signal:AbortSignal.timeout(60000)});if(!r.ok)throw Error('Media download failed: '+r.status);
 if(Number(r.headers.get('content-length'))>40*1024*1024){await r.body.cancel();throw Error('Source exceeds reviewed size');}
 const chunks=[];let count=0;for await(const chunk of r.body){count+=chunk.length;if(count>40*1024*1024)throw Error('Source exceeds reviewed size');chunks.push(chunk);}return Buffer.concat(chunks);
}
function command(args){const r=spawnSync('ffmpeg',['-hide_banner','-nostdin','-y','-filter_threads','1','-filter_complex_threads','1',...args],{encoding:'utf8',maxBuffer:4*1024*1024});if(r.status!==0)throw Error('FFmpeg failed: '+r.stderr.slice(-2500));return r.stderr;}
function probe(file){const r=spawnSync('ffprobe',['-v','error','-show_streams','-show_format','-of','json',file],{encoding:'utf8'});if(r.status!==0)throw Error('ffprobe failed');return JSON.parse(r.stdout);}
async function image(url){
 const key=pathOf(url);if(manifest.images[key])return;const input=await bytes(url),id=hash(input),meta=await sharp(input).metadata();
 const sourceFile=join(work,'sources',id+'.image');await writeFile(sourceFile,input);originals[key]={file:sourceFile,type:'image/'+(meta.format==='jpeg'?'jpeg':meta.format)};
 const widths=[...new Set([320,640,960,1280,1920].map(w=>Math.min(w,meta.width)))].sort((a,b)=>a-b),variants=[];
 for(const width of widths){const encoded=await sharp(input).rotate().resize({width,withoutEnlargement:true}).webp({quality:88,effort:6}).toBuffer();const file=`img-${hash(encoded)}-${width}.webp`;await writeFile(join(out,file),encoded);variants.push({width,url:'/media-performance/assets/'+file,bytes:encoded.length});}
 const sample=variants.find(v=>v.width>=1280)||variants.at(-1),reference=join(work,'sources',id+'-reference.png');await sharp(input).rotate().resize({width:sample.width}).png().toFile(reference);
 const quality=command(['-i',reference,'-i',join(overlay,'dist',sample.url),'-lavfi','ssim','-an','-f','null','-']),ssim=Number([...quality.matchAll(/All:([0-9.]+)/g)].at(-1)?.[1]);if(!(ssim>=.95))throw Error('Image quality gate failed: '+ssim);
 manifest.images[key]={width:meta.width,height:meta.height,variants};report.images.push({source:key,sourceBytes:input.length,width:meta.width,height:meta.height,ssim,variants});
}
const items=selections.hero.items?.length?selections.hero.items:[selections.hero];
for(const item of items){
 if(item.type==='image'){await image(item.url);continue;}if(item.type!=='video')continue;
 const key=pathOf(item.url),input=await bytes(item.url),id=hash(input),source=join(work,'sources',id+'.mp4');await writeFile(source,input);
 originals[key]={file:source,type:'video/mp4'};
 const original=probe(source),video=original.streams.find(s=>s.codec_type==='video'),audio=original.streams.filter(s=>s.codec_type==='audio').length;
 const entry={};
 for(const [kind,width,crf,budget] of [['mobile',1280,24,4*1024*1024],['desktop',1920,23,8*1024*1024]]){
  const name=`hero-${id}-${width}.mp4`,dest=join(out,name),posterName=`hero-${id}-poster-${width}.webp`,posterPng=join(work,'sources',id+'-'+width+'.png');
  command(['-i',source,'-map','0:v:0','-map','0:a?','-vf',`scale=${width}:-2:flags=lanczos`,'-c:v','libx264','-preset','medium','-crf',String(crf),'-pix_fmt','yuv420p','-threads','2','-c:a','aac','-b:a','128k','-movflags','+faststart',dest]);
  command(['-ss','0','-i',dest,'-frames:v','1','-threads','1',posterPng]);
  const poster=await sharp(await readFile(posterPng)).webp({quality:90,effort:6}).toBuffer();await writeFile(join(out,posterName),poster);
  const info=probe(dest),v=info.streams.find(s=>s.codec_type==='video'),size=(await stat(dest)).size;
  if(size>budget||Math.abs(Number(info.format.duration)-Number(original.format.duration))>.2||info.streams.filter(s=>s.codec_type==='audio').length!==audio)throw Error('Video size, duration or audio preservation failed');
  const quality=command(['-i',source,'-i',dest,'-filter_complex',`[0:v]scale=${width}:-2:flags=lanczos,format=yuv420p[reference];[reference][1:v]ssim`,'-threads','2','-an','-f','null','-']);
  const ssim=Number([...quality.matchAll(/All:([0-9.]+)/g)].at(-1)?.[1]);if(!(ssim>=.95))throw Error('Encoded video quality below SSIM gate: '+ssim);
  entry[kind]={url:'/media-performance/assets/'+name,poster:'/media-performance/assets/'+posterName,width:v.width,height:v.height,bytes:size,posterBytes:poster.length,ssim};
 }
 manifest.videos[key]=entry;report.videos.push({source:key,sourceBytes:input.length,originalWidth:video.width,originalHeight:video.height,duration:Number(original.format.duration),audioStreams:audio,variants:entry});
}
const urls=[];function collect(v){if(!v||typeof v!=='object')return;if(v.type==='image'&&v.url)urls.push(v.url);for(const child of Object.values(v))if(typeof child==='object')collect(child);}collect(selections.landing);
for(const url of new Set(urls))await image(url);
const portraits=join(base,'dist/assets/images/ananya-portraits');for(const file of await readdir(portraits))if(/\.(jpg|jpeg|png|webp)$/i.test(file))await image('/assets/images/ananya-portraits/'+file);
await writeFile(join(work,'manifest.json'),JSON.stringify(manifest,null,2));
await writeFile(join(work,'originals.json'),JSON.stringify(originals,null,2));
await writeFile('evidence/media-performance/media.json',JSON.stringify({passed:true,...report},null,2));
console.log('PASS: optimized '+report.images.length+' images and '+report.videos.length+' selected video; duration, audio and SSIM quality preserved');
