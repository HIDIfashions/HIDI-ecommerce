// One independent document, using the existing landing-media container and identity.
export const KEY='brand/landing-media/portrait-order.json';
export function createPortraitOrderStore({config,token,requestFetch=fetch}) {
  async function request(method,value,etag) {
    const settings=config();
    if(settings.provider!=='azure')throw new Error('Azure landing media required');
    const url=new URL(settings.blobEndpoint.endsWith('/')?settings.blobEndpoint:settings.blobEndpoint+'/');
    url.pathname=url.pathname.replace(/\/$/,'')+'/'+encodeURIComponent(settings.container)+'/'+KEY;
    const headers={Authorization:'Bearer '+await token(settings),'x-ms-version':'2023-11-03','x-ms-date':new Date().toUTCString()};
    if(method==='PUT')Object.assign(headers,{'Content-Type':'application/json','x-ms-blob-type':'BlockBlob',[etag?'If-Match':'If-None-Match']:etag||'*'});
    const response=await requestFetch(url,{method,headers,body:value===undefined?undefined:JSON.stringify(value),signal:AbortSignal.timeout(10000),redirect:'error'});
    if(method==='GET'&&response.status===404)return {value:null,etag:null};
    if(response.status===409||response.status===412)throw Object.assign(new Error('The order changed in another session. Reload saved order before saving.'),{status:409});
    if(!response.ok)throw new Error('Gallery storage unavailable');
    const version=response.headers.get('etag');
    if(!version)throw new Error('Gallery storage version missing');
    if(method==='PUT')return {etag:version};
    const text=await response.text();if(Buffer.byteLength(text)>8192)throw new Error('Invalid gallery document');
    return {value:JSON.parse(text),etag:version};
  }
  return {load:()=>request('GET'),save:(value,etag)=>request('PUT',value,etag)};
}
