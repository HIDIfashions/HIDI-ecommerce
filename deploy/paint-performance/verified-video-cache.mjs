import {createHash} from 'node:crypto';
import {writeFile} from 'node:fs/promises';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
// Exact originals and immutable bytes from runs 39019085728 / 39154241810. The builder still
// independently checks every frame, audio, duration, SSIM and savings gate.
export const encodingRecipe={encoder:'libaom-av1',crf:38,cpuUsed:4,audio:'copy',frames:'passthrough'};
export const desktopEncodingRecipe={encoder:'libaom-av1',crf:41,cpuUsed:3,tune:'ssim',audio:'copy',frames:'passthrough'};
const rows={
 a0480a593165481d0a05f35c2cda7c66fbf1c591206b02249ce83cfab45d5202:['8774287eb27ac5cdbd1b8f8aebadaa5319227400e930abd6e2d01b87082ff535',1280,{encoder:'libaom-av1',crf:38,cpuUsed:4,audio:'copy',frames:'passthrough'}],
 '7249196281f97f69519aac8f1a338239d1435b7f00728de49bc82748c0bddc9e':['b8ce8a98433c0031ad82782c8be446ff2609ed181806746d2381ff07642f1ac1',1920,{encoder:'libaom-av1',crf:41,cpuUsed:3,tune:'ssim',audio:'copy',frames:'passthrough'}]
};
export function verifiedVideoFor(sourceSha,recipe){const row=rows[sourceSha];return row&&JSON.stringify(recipe)===JSON.stringify(row[2])?row:null;}
export async function reuseVerifiedVideo(source,output,recipe,fetcher=fetch){
 const row=verifiedVideoFor(sha(source),recipe);if(!row)return false;
 try{
  const response=await fetcher('https://zealous-bay-013205300.1.azurestaticapps.net/media-performance/assets/hero-av1-'+row[0].slice(0,16)+'-'+row[1]+'.mp4',{signal:AbortSignal.timeout(30000),redirect:'error'});
  if(!response.ok)return false;
  const bytes=Buffer.from(await response.arrayBuffer());if(sha(bytes)!==row[0])return false;
  await writeFile(output,bytes);return true;
 }catch{return false;}
}
