import assert from 'node:assert/strict';import {readFile,writeFile,mkdir} from 'node:fs/promises';import {join} from 'node:path';import {createHash} from 'node:crypto';
import {existsSync} from 'node:fs';import {pathToFileURL} from 'node:url';
import {indexedPng} from './indexed-png.mjs';
import {buildCountdownAsset} from './countdown-source.mjs';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
export async function readSeoScript(base){
 const module=join(base,'seo-discovery/metadata.mjs');
 if(existsSync(module)){const value=(await import(pathToFileURL(module).href)).clientMetadataScript;assert.equal(typeof value,'string','Current SEO metadata script must be available');return value;}
 return (await readFile(join(base,'dist/index.html'),'utf8')).replace(/\r\n/g,'\n');
}
export async function buildHeadAssets(base,overlay,sharp,options={}){
 const countdown=await buildCountdownAsset(base,overlay);
 const source=await readFile(join(base,'dist/assets/images/hidi-logo.png')),info=await sharp(source).metadata(),pixels=await sharp(source).ensureAlpha().raw().toBuffer();let encoded=source;
 const chunks=[];for(let offset=8;offset<source.length;){const length=source.readUInt32BE(offset);chunks.push(source.subarray(offset+4,offset+8).toString());offset+=12+length;}
 const plainPng=chunks.every(type=>['IHDR','IDAT','IEND'].includes(type));
 if(!info.icc&&plainPng)for(const adaptiveFiltering of [false,true]){const bytes=await sharp(source).png({compressionLevel:9,adaptiveFiltering}).toBuffer();if(bytes.length<encoded.length)encoded=bytes;}
 if(!info.icc&&plainPng){const bytes=indexedPng(pixels,info.width,info.height);if(bytes&&bytes.length<encoded.length)encoded=bytes;}
 const next=await sharp(encoded).metadata();assert.equal(next.width,info.width);assert.equal(next.height,info.height);assert(pixels.equals(await sharp(encoded).ensureAlpha().raw().toBuffer()),'Every logo RGBA pixel must remain exact');
 const logoUrl='/media-performance/assets/logo-'+hash(encoded).slice(0,16)+'.png';await mkdir(join(overlay,'dist/media-performance/assets'),{recursive:true});await writeFile(join(overlay,'dist',logoUrl),encoded);
 const logo={url:logoUrl,sourceSha256:hash(source),sha256:hash(encoded),width:info.width,height:info.height,sourceBytes:source.length,bytes:encoded.length,allRgbaPixelsIdentical:true};
 const desktopPreview=options.desktopPreview;
 if(desktopPreview!==undefined){assert(/^data:image\/avif;base64,[A-Za-z0-9+/]+={0,2}$/.test(desktopPreview)&&desktopPreview.length<=2048,'Desktop preview must be a bounded AVIF data URL');}
 // Match the HTML line endings written by the existing Python image overlay.
 const html=await readSeoScript(base),match=html.match(/<script\b([^>]*data-hidi-seo-identity=["']1["'][^>]*)>([\s\S]*?)<\/script>/i);let seo=null;
 if(match&&!/(?:^|\s)(?:src|async|integrity)\b/i.test(match[1])&&!/\btype=["']module["']/i.test(match[1])){const code=match[2],sha256=hash(code),url='/assets/home-seo-'+sha256.slice(0,16)+'.js';await mkdir(join(overlay,'dist/assets'),{recursive:true});await writeFile(join(overlay,'dist',url),code);seo={url,sha256,sourceCodeUnchanged:true,bytes:Buffer.byteLength(code)};}
 if(existsSync(join(base,'seo-discovery/metadata.mjs')))assert(seo,'The current runtime SEO script must be preserved as an exact external asset');
 await mkdir(join(overlay,'paint-performance'),{recursive:true});await writeFile(join(overlay,'paint-performance/head-assets.json'),JSON.stringify({logo,seo,countdown,...(desktopPreview?{desktopPreview}:{})}));
 return {passed:true,logo,seo,countdown,...(desktopPreview?{desktopPreview}:{})};
}
