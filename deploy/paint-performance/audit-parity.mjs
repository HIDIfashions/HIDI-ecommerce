import {isMirrorAsset} from './asset-mirror.mjs';
export function externalScriptUrls(items,mirror=null){
 return [...new Set(items.filter(item=>item.resourceType==='Script').flatMap(item=>{try{const url=new URL(item.url);return /^https?:$/.test(url.protocol)&&!['hidiindia.com','www.hidiindia.com'].includes(url.hostname)&&!isMirrorAsset(url.href,mirror)?[url.href]:[];}catch{return [];}}))].sort();
}
export function isPinnedFixtureResponse(response){return response?.url==='https://hidiindia.com/'&&response.remoteIPAddress==='127.0.0.1'&&response.remotePort===3190;}
export function requireHealthyAudit(items,mirror=null){
 const required=['/api/store/products','/api/hidi/hero-config','/api/hidi/landing-media-config','/api/hidi/analytics-config','/api/hidi/offers'];
 for(const path of required){const rows=items.filter(item=>{try{const url=new URL(item.url);return url.hostname==='hidiindia.com'&&url.pathname===path;}catch{return false;}});if(!rows.length||rows.some(row=>row.statusCode!==200))throw Error('Public audit endpoint unavailable: '+path);}
 for(const url of externalScriptUrls(items,mirror))if(items.some(item=>item.url===url&&item.statusCode!==200))throw Error('Production analytics SDK unavailable: '+url);
 if(mirror){const entry=Object.keys(mirror.files).find(path=>path.endsWith('.js'));if(!entry||!items.some(item=>item.url===mirror.origin+entry&&item.statusCode===200))throw Error('Verified mirrored application must load successfully');if(items.some(item=>isMirrorAsset(item.url,mirror)&&![200,206].includes(item.statusCode)))throw Error('Verified immutable asset mirror unavailable');}
}
