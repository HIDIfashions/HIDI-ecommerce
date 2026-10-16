export function externalScriptUrls(items){
 return [...new Set(items.filter(item=>item.resourceType==='Script').flatMap(item=>{try{const url=new URL(item.url);return /^https?:$/.test(url.protocol)&&!['hidiindia.com','www.hidiindia.com'].includes(url.hostname)?[url.href]:[];}catch{return [];}}))].sort();
}
export function isPinnedFixtureResponse(response){return response?.url==='https://hidiindia.com/'&&response.remoteIPAddress==='127.0.0.1'&&response.remotePort===3190;}
