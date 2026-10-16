import assert from 'node:assert/strict';import {readFile,writeFile,mkdir} from 'node:fs/promises';import {join} from 'node:path';import {createHash} from 'node:crypto';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
export async function buildHeadAssets(base,overlay,sharp){
 const source=await readFile(join(base,'dist/assets/images/hidi-logo.png')),info=await sharp(source).metadata(),pixels=await sharp(source).ensureAlpha().raw().toBuffer();let encoded=source;
 const chunks=[];for(let offset=8;offset<source.length;){const length=source.readUInt32BE(offset);chunks.push(source.subarray(offset+4,offset+8).toString());offset+=12+length;}
 const plainPng=chunks.every(type=>['IHDR','IDAT','IEND'].includes(type));
 if(!info.icc&&plainPng)for(const adaptiveFiltering of [false,true]){const bytes=await sharp(source).png({compressionLevel:9,adaptiveFiltering}).toBuffer();if(bytes.length<encoded.length)encoded=bytes;}
 const next=await sharp(encoded).metadata();assert.equal(next.width,info.width);assert.equal(next.height,info.height);assert(pixels.equals(await sharp(encoded).ensureAlpha().raw().toBuffer()),'Every logo RGBA pixel must remain exact');
 const logoUrl='/media-performance/assets/logo-'+hash(encoded).slice(0,16)+'.png';await mkdir(join(overlay,'dist/media-performance/assets'),{recursive:true});await writeFile(join(overlay,'dist',logoUrl),encoded);
 const logo={url:logoUrl,sourceSha256:hash(source),sha256:hash(encoded),width:info.width,height:info.height,sourceBytes:source.length,bytes:encoded.length,allRgbaPixelsIdentical:true};
 // Match the HTML line endings written by the existing Python image overlay.
 const html=(await readFile(join(base,'dist/index.html'),'utf8')).replace(/\r\n/g,'\n'),match=html.match(/<script\b([^>]*data-hidi-seo-identity=["']1["'][^>]*)>([\s\S]*?)<\/script>/i);let seo=null;
 if(match&&!/(?:^|\s)(?:src|async|integrity)\b/i.test(match[1])&&!/\btype=["']module["']/i.test(match[1])){const code=match[2],sha256=hash(code),url='/assets/home-seo-'+sha256.slice(0,16)+'.js';await mkdir(join(overlay,'dist/assets'),{recursive:true});await writeFile(join(overlay,'dist',url),code);seo={url,sha256,sourceCodeUnchanged:true,bytes:Buffer.byteLength(code)};}
 await mkdir(join(overlay,'paint-performance'),{recursive:true});await writeFile(join(overlay,'paint-performance/head-assets.json'),JSON.stringify({logo,seo}));
 return {passed:true,logo,seo};
}
