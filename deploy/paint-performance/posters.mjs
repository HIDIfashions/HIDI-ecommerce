import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {join,resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {posterQualityStart} from './poster-quality-start.mjs';
const base=resolve(process.argv[2]),overlay=resolve(process.argv[3]);
const require=createRequire(join(base,'apps/web/server.js'));
const sharp=process.env.HIDI_LOCAL_SHARP ? require(process.env.HIDI_LOCAL_SHARP) : require('next/dist/server/image-optimizer.js').getSharp(1,false);
const html=await readFile(join(base,'dist/index.html'),'utf8');
const ref=html.match(/<script type="module" crossorigin src="([^"]+)"/)[1].replace(/^\.?\//,'');
const js=await readFile(join(base,'dist',ref),'utf8');
const manifest=JSON.parse(js.match(/^const HidiMediaManifest=(.*);$/m)[1]);
const output=join(overlay,'dist/media-performance/assets');await mkdir(output,{recursive:true});
const report=[];
async function encodePoster(input,kind,original,referenceWidth=null,sourceBytes=input.length,startAt=60){
 const reference=join(overlay,kind+'-reference.png');await sharp(input).png().toFile(reference);
 let selected;
 const startQuality=Math.max(startAt,posterQualityStart(input));
 for(const quality of Array.from({length:91-startQuality},(_,index)=>startQuality+index)){
  const encoded=await sharp(input).avif({quality,effort:6,chromaSubsampling:'4:2:0'}).toBuffer();
  const decoded=join(overlay,kind+'-decoded.png');await sharp(encoded).png().toFile(decoded);
  const result=spawnSync(process.env.HIDI_LOCAL_FFMPEG || 'ffmpeg',['-hide_banner','-nostdin','-filter_threads','1','-i',reference,'-i',decoded,'-lavfi','ssim','-an','-f','null','-'],{encoding:'utf8'});
  if(result.status!==0)throw Error(result.stderr);
  const ssim=Number([...result.stderr.matchAll(/All:([0-9.]+)/g)].at(-1)?.[1]);
  if(ssim>=.985){if(encoded.length>=sourceBytes)throw Error('No quality-preserving savings');selected={encoded,quality,ssim};break;}
 }
 if(!selected)throw Error('AVIF quality gate failed');
 const name='poster-'+createHash('sha256').update(selected.encoded).digest('hex').slice(0,16)+'.avif';
 await writeFile(join(output,name),selected.encoded);const url='/media-performance/assets/'+name,info=await sharp(selected.encoded).metadata();
 report.push({kind,original,url,originalBytes:sourceBytes,referenceBytes:input.length,bytes:selected.encoded.length,quality:selected.quality,ssim:selected.ssim,width:info.width,height:info.height,referenceWidth,originalPreserved:true});
 for(const suffix of ['reference','decoded'])await (await import('node:fs/promises')).unlink(join(overlay,kind+'-'+suffix+'.png'));
 return url;
}
for(const item of Object.values(manifest.videos))for(const kind of ['mobile','desktop']){
 const variant=item[kind],input=await readFile(join(base,'dist',variant.poster));
 variant.avifPoster=await encodePoster(input,kind,variant.poster);
 if(kind==='mobile'){
  const info=await sharp(input).metadata();if(info.width!==1280||info.height!==720)throw Error('Portrait crop requires the reviewed landscape frame');
  const crop={left:384,top:0,width:512,height:720,sourceWidth:1280,sourceHeight:720};
  const small=await sharp(input).extract({left:crop.left,top:crop.top,width:crop.width,height:crop.height}).png().toBuffer();
  const originalPixels=await sharp(input).extract({left:crop.left,top:crop.top,width:crop.width,height:crop.height}).ensureAlpha().raw().toBuffer();
  if(!originalPixels.equals(await sharp(small).ensureAlpha().raw().toBuffer()))throw Error('Portrait extraction must preserve every source pixel');
  variant.avifPosterSmall=await encodePoster(small,'mobile-crop',variant.poster,512,input.length);
  variant.posterCrop=crop;report.at(-1).crop=crop;report.at(-1).sourcePixelsRetained=true;
 }
 if(kind==='desktop'){
  const info=await sharp(input).metadata();if(info.width!==1920||info.height!==1080)throw Error('Desktop crop requires reviewed landscape dimensions');
  // The tall desktop tier is selected at the Lighthouse desktop viewport
  // (1350×940) and renders at roughly one CSS pixel per source pixel. Keep
  // the centered visible field without sending a 1600×1080 image to a
  // 1393×940 render. Wider desktop viewports continue to use the full tier.
  const crop={left:240,top:54,width:1440,height:972,sourceWidth:1920,sourceHeight:1080};
  const small=await sharp(input).extract({left:crop.left,top:crop.top,width:crop.width,height:crop.height}).png().toBuffer();
  const pixels=await sharp(input).extract({left:crop.left,top:crop.top,width:crop.width,height:crop.height}).ensureAlpha().raw().toBuffer();
  if(!pixels.equals(await sharp(small).ensureAlpha().raw().toBuffer()))throw Error('Desktop crop changed source pixels');
  variant.avifPosterSmall=await encodePoster(small,'desktop-crop',variant.poster,1440,input.length,74);
  variant.posterCrop=crop;report.at(-1).crop=crop;report.at(-1).sourcePixelsRetained=true;
 }

}
const {encodeHeroVideos}=await import('./video.mjs');
const videoReport=await encodeHeroVideos(base,overlay,manifest);
const {buildHeadAssets}=await import('./head-assets.mjs');const headAssets=await buildHeadAssets(base,overlay,sharp);
const probe=await sharp({create:{width:2,height:2,channels:3,background:'#ffffff'}}).avif().toBuffer();
await writeFile(join(overlay,'poster-build.json'),JSON.stringify({manifest,report,videoReport,headAssets,probe:probe.toString('base64')}));
console.log(JSON.stringify(report));
