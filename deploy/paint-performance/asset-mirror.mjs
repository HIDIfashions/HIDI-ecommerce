import {readFile} from 'node:fs/promises';
const asset=/^\/(?:assets\/index-[a-f0-9]{16}\.js|media-performance\/assets\/(?:poster-[a-f0-9]{16}\.avif|hero-av1-[a-f0-9]{16}-\d+\.mp4))$/;
export function normalizeMirror(value){
 if(value?.passed!==true||value.bootOnce!==true||!/^https:\/\/[a-z0-9-]+(?:\.\d+)?\.azurestaticapps\.net$/.test(value.origin||'')||!value.files||typeof value.files!=='object')return null;
 const rows=Object.entries(value.files);if(!rows.length||rows.length>128||rows.some(([path,sha])=>!asset.test(path)||!/^[a-f0-9]{64}$/.test(sha)||!path.includes(sha.slice(0,16))))return null;
 return {origin:value.origin,files:value.files};
}
export function isMirrorAsset(url,mirror){try{const u=new URL(url);return Boolean(mirror&&u.origin===mirror.origin&&!u.search&&!u.hash&&Object.hasOwn(mirror.files,u.pathname));}catch{return false;}}
export async function readMirrorProof(out){try{const value=normalizeMirror(JSON.parse(await readFile(out+'/asset-mirror.json','utf8')));if(!value)throw Error('Invalid immutable asset mirror proof');return value;}catch(error){if(error.code==='ENOENT')return null;throw error;}}
