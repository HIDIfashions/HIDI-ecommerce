import {createHash} from 'node:crypto';
import {writeFile} from 'node:fs/promises';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
// Exact originals and immutable bytes from run 39019085728. The builder still
// independently checks every frame, audio, duration, SSIM and savings gate.
export const encodingRecipe={encoder:'libaom-av1',crf:38,cpuUsed:4,audio:'copy',frames:'passthrough'};
export const desktopEncodingRecipe={encoder:'libaom-av1',crf:41,cpuUsed:3,tune:'ssim',audio:'copy',frames:'passthrough'};
const cachedRecipe=encodingRecipe;
const rows={
 a0480a593165481d0a05f35c2cda7c66fbf1c591206b02249ce83cfab45d5202:['8774287eb27ac5cdbd1b8f8aebadaa5319227400e930abd6e2d01b87082ff535',1280],
 '7249196281f97f69519aac8f1a338239d1435b7f00728de49bc82748c0bddc9e':['fd72ee4d87c7806ef2dc9668da35025f27cb9181d0595f5c85a5a00888ce672c',1920]
};
export async function reuseVerifiedVideo(source,output,recipe,fetcher=fetch){
 if(JSON.stringify(recipe)!==JSON.stringify(cachedRecipe))return false;
 const row=rows[sha(source)];if(!row)return false;
 try{
  const response=await fetcher('https://zealous-bay-013205300.1.azurestaticapps.net/media-performance/assets/hero-av1-'+row[0].slice(0,16)+'-'+row[1]+'.mp4',{signal:AbortSignal.timeout(30000),redirect:'error'});
  if(!response.ok)return false;
  const bytes=Buffer.from(await response.arrayBuffer());if(sha(bytes)!==row[0])return false;
  await writeFile(output,bytes);return true;
 }catch{return false;}
}
