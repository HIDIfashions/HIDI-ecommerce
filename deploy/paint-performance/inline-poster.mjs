import {readFileSync} from 'node:fs';import {createHash} from 'node:crypto';
const cached=new Map();
export function posterProfile(request){
 const headers=request?.headers||{},accept=String(headers.accept||'').split(',').map(value=>value.trim().toLowerCase());
 if(String(headers['save-data']||'').toLowerCase()==='on')return null;
 const avif=accept.find(value=>value.split(';')[0]==='image/avif');
 if(!avif||/;\s*q=0(?:\.0*)?(?:;|$)/.test(avif)||!headers['user-agent'])return null;
 return headers['sec-ch-ua-mobile']==='?1'||/iPhone|iPod|Android.*Mobile/i.test(String(headers['user-agent']))?'mobile':'desktop';
}
export function posterWasWarmed(request,url){
 const hash=/poster-([a-f0-9]{16})\.avif$/.exec(url||'')?.[1];
 const value=String(request?.headers?.cookie||'').split(';').map(part=>part.trim()).find(part=>part.startsWith('hidi_poster_cache='))?.slice('hidi_poster_cache='.length);
 return Boolean(hash&&String(value||'').split('.').slice(0,2).includes(hash));
}
export function preparePosterHead(html,request){
 const kind=posterProfile(request);if(!kind)return html;
 return html.replace(/<link\b[^>]*>/gi,tag=>/\brel="preload"/.test(tag)&&/\bas="image"/.test(tag)&&/\btype="image\/avif"/.test(tag)&&tag.includes(kind==='mobile'?'max-width: 700px':'min-width: 701px')&&!posterWasWarmed(request,/\bhref="([^"]+)"/.exec(tag)?.[1])?'':tag);
}
export function inlinePoster(variants,request,load=url=>readFileSync(new URL('../dist'+url,import.meta.url))){
 const kind=posterProfile(request),url=variants[kind]?.avifPoster;if(!kind||!/^\/media-performance\/assets\/poster-[a-f0-9]{16}\.avif$/.test(url||''))return null;
 if(posterWasWarmed(request,url))return null;
 try{
  if(!cached.has(url)){const bytes=load(url);if(bytes.length>160000||!url.includes(createHash('sha256').update(bytes).digest('hex').slice(0,16)))return null;cached.set(url,bytes.toString('base64'));}
  return {url,base64:cached.get(url)};
 }catch{return null;}
}
