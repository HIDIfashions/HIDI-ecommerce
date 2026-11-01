import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {startPreview as startHero,OWNER} from './fixture.mjs';
export {OWNER};
export async function startPreview(root,{port=0,currentHero=false}={}){
 root=resolve(root);let initialHero=null,initialAssets=[];
 if(currentHero){
  initialHero=JSON.parse(await readFile(join(root,'public-before.json'),'utf8'))['/api/hidi/hero-config'];
  await mkdir(join(root,'media'),{recursive:true});
  for(const [index,item]of initialHero.items.entries()){
   const file=join(root,'media',index+'-'+(item.type==='image'?'image.webp':'video.mp4'));let bytes;
   try{bytes=await readFile(file);}catch{const r=await fetch(new URL(item.url,'https://hidiindia.com'));if(!r.ok)throw Error('Cannot load current hero');bytes=Buffer.from(await r.arrayBuffer());await writeFile(file,bytes);}
   initialAssets.push({url:item.url,bytes,type:item.type==='image'?'image/webp':'video/mp4'});
  }
 }
 return startHero(root,{port,handlerRoot:'candidate',initialHero,initialAssets});
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){const s=await startPreview(process.argv[2],{port:Number(process.argv[3]||4329),currentHero:true});console.log('Admin preview: '+s.base+'/review');}
