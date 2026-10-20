import {readFile,writeFile} from 'node:fs/promises';import {join} from 'node:path';import {createHash} from 'node:crypto';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
// Copies encoded bytes only; the normal builder independently checks the codec,
// every frame, audio, duration, SSIM and savings against the current original.
export async function reuseVideo(base,cache,variant,output){
 if(!cache||!/^\/media-performance\/assets\/[a-z0-9-]+\.mp4$/.test(variant.url))return false;
 try{const videos=JSON.parse(await readFile(join(cache,'paint-performance/initial-hero.json'),'utf8'));
  const row=Object.values(videos).flatMap(item=>[item.mobile,item.desktop]).find(row=>row?.url===variant.url);
  if(!row||!/^\/media-performance\/assets\/hero-av1-[a-f0-9]{16}-\d+\.mp4$/.test(row.av1Url||''))return false;
  const source=await readFile(join(base,'dist',variant.url)),cachedSource=await readFile(join(cache,'dist',row.url));if(!source.equals(cachedSource))return false;
  const bytes=await readFile(join(cache,'dist',row.av1Url));if(!row.av1Url.includes(sha(bytes).slice(0,16)))return false;
  await writeFile(output,bytes);return true;
 }catch(error){if(error.code==='ENOENT'||error instanceof SyntaxError)return false;throw error;}
}
