import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
export async function imageProbe(base,output){
 const audit=JSON.parse(await readFile(new URL('./image-audit.json',import.meta.url),'utf8'));
 const headers={'x-forwarded-host':'hidiindia.com','x-forwarded-proto':'https'};
 let cursor=0,retries=0;const results=[];
 await Promise.all(Array.from({length:2},async()=>{
  while(cursor<audit.results.length){
   const item=audit.results[cursor++];let response;
   for(let attempt=0;attempt<2;attempt++){
    try{response=await fetch(base+item.path,{method:'HEAD',headers,signal:AbortSignal.timeout(30000)});if([502,503,504].includes(response.status)&&attempt===0){retries++;continue;}break;}catch(error){if(attempt)throw error;retries++;}
   }
   assert.equal(response.status,200,item.path+' image status');
   assert.match(response.headers.get('content-type'),/^image\/(?:jpeg|png|webp|avif)/);
   assert(!/noindex/i.test(response.headers.get('x-robots-tag')||''),item.path+' is still excluded from image search');
   assert.match(response.headers.get('x-robots-tag')||'',/index, follow/);
   results.push({path:item.path,status:response.status,robots:response.headers.get('x-robots-tag'),etag:response.headers.get('etag')});
  }
 }));
 const cached=[];
 for(const previous of [audit.results.find(r=>!r.robots),audit.results.find(r=>/noindex/.test(r.robots||''))]){
  const row=results.find(r=>r.path===previous.path);assert(row.etag,'Immutable image needs a validator');
  const response=await fetch(base+row.path,{method:'HEAD',headers:{...headers,'if-none-match':row.etag},signal:AbortSignal.timeout(30000)});
  assert.equal(response.status,304,'Image cache validation status');assert.equal(response.headers.get('x-robots-tag'),'index, follow','Cached noindex must be explicitly replaced');
  cached.push({path:row.path,status:304,robots:response.headers.get('x-robots-tag')});
 }
 const preview=await fetch(base+cached[1].path,{method:'HEAD',headers:{'x-forwarded-host':'seo-preview.invalid'},signal:AbortSignal.timeout(30000)});
 assert(preview.status===404||/noindex/.test(preview.headers.get('x-robots-tag')||''),'Preview image restriction changed');
 const sitemap=await (await fetch(base+'/sitemap.xml',{headers})).text();
 for(const row of results)assert(sitemap.includes('https://hidiindia.com'+row.path),'Published image missing from sitemap: '+row.path);
 const report={passed:true,verifiedPublishedImages:results.length,previouslyExcluded:audit.results.filter(r=>/noindex/.test(r.robots||'')).length,cached,previewRestricted:true,imagesInSitemap:true,retries,results};
 await writeFile(output,JSON.stringify(report,null,2));console.log('PASS: '+results.length+' published images indexable, cached validators corrected, previews restricted and sitemap complete');return report;
}
