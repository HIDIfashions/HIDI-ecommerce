import {readFile} from 'node:fs/promises';
const asset=/^\/(?:assets\/(?:index-[a-f0-9]{16}\.js|style-[a-f0-9]{16}\.css)|media-performance\/assets\/(?:poster-[a-f0-9]{16}\.avif|hero-av1-[a-f0-9]{16}-\d+\.mp4))$/;
export function normalizeMirror(value){
 if(value?.passed!==true||value.bootOnce!==true||!/^https:\/\/[a-z0-9-]+(?:\.\d+)?\.azurestaticapps\.net$/.test(value.origin||'')||!value.files||typeof value.files!=='object')return null;
 const rows=Object.entries(value.files);if(!rows.length||rows.length>128||rows.some(([path,sha])=>!asset.test(path)||!/^[a-f0-9]{64}$/.test(sha)||!path.includes(sha.slice(0,16))))return null;
 if(value.edgeOrigin!==undefined||value.edgeFiles!==undefined){
  if(value.edgeOrigin!=='https://hidi-performance-posters.pages.dev'||!value.edgeFiles||typeof value.edgeFiles!=='object'||Array.isArray(value.edgeFiles))return null;
  const edge=Object.entries(value.edgeFiles);if(!edge.length||edge.some(([path,sha])=>value.files[path]!==sha))return null;
 }
 return {origin:value.origin,files:value.files,...(value.edgeOrigin?{edgeOrigin:value.edgeOrigin,edgeFiles:value.edgeFiles}:{})};
}
export function mirrorAssetUrl(path,mirror){return mirror&&Object.hasOwn(mirror.files,path)?(mirror.edgeOrigin&&Object.hasOwn(mirror.edgeFiles||{},path)?mirror.edgeOrigin:mirror.origin)+path:path;}
export function isMirrorAsset(url,mirror){try{const u=new URL(url);return Boolean(mirror&&!u.search&&!u.hash&&(u.origin===mirror.origin&&Object.hasOwn(mirror.files,u.pathname)||u.origin===mirror.edgeOrigin&&Object.hasOwn(mirror.edgeFiles||{},u.pathname)));}catch{return false;}}
export async function readMirrorProof(out){try{const value=normalizeMirror(JSON.parse(await readFile(out+'/asset-mirror.json','utf8')));if(!value)throw Error('Invalid immutable asset mirror proof');return value;}catch(error){if(error.code==='ENOENT')return null;throw error;}}
