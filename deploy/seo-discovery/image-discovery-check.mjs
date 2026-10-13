import assert from 'node:assert/strict';
import { writeFile, mkdir } from 'node:fs/promises';
import publishedImages from './published-product-images.json' with {type:'json'};
import { identityUrl } from './metadata.mjs';
import { productImageUrls } from './sitemap.mjs';

const base='https://hidiindia.com';
const response=await fetch(base+'/api/store/products',{signal:AbortSignal.timeout(30000)});
assert.equal(response.status,200);
const products=await response.json();
const current=new Set();
for(const product of products) {
  if(product.status&&product.status!=='ACTIVE')continue;
  for(const image of [...(product.images||[]),...(product.variants||[]).flatMap(v=>v.images||[])]) {
    const url=new URL(identityUrl(image.url),base);
    assert.equal(url.origin,base,'Catalogue image must resolve to the verified production origin');
    assert(!url.search&&!url.hash&&!url.username&&!url.password,'No signed or credential-bearing image URLs');
    assert(/^\/media\/products\/variants\/[A-Za-z0-9_-]+\/[A-Za-z0-9._-]+\.(?:jpe?g|png|webp|avif)$/i.test(url.pathname),'Public product-image path required');
    current.add(url.pathname);
  }
}
assert.deepEqual([...current].sort(),[...publishedImages].sort(),'Published image associations changed; refresh before release');
const requireIndex=process.argv.includes('--released');
let cursor=0;const results=[];
await Promise.all(Array.from({length:4},async()=>{
  while(cursor<publishedImages.length) {
    const path=publishedImages[cursor++];
    const res=await fetch(base+path,{method:'HEAD',redirect:'manual',signal:AbortSignal.timeout(30000)});
    assert.equal(res.status,200,path+' is reachable');
    assert(res.headers.get('content-type')?.startsWith('image/'),path+' retains image MIME');
    if(requireIndex)assert(!res.headers.get('x-robots-tag')?.includes('noindex'),path+' is eligible for image indexing');
    results.push({path,status:res.status,robots:res.headers.get('x-robots-tag')});
  }
}));
const report={passed:true,productCount:products.length,imageCount:results.length,
  productImageAssociations:products.reduce((n,p)=>n+productImageUrls(p).length,0),
  requireIndex,readOnly:true,databaseWrites:0,blobWrites:0,checkedAt:new Date().toISOString(),results};
await mkdir('evidence/seo-discovery',{recursive:true});
await writeFile('evidence/seo-discovery/image-discovery-'+(requireIndex?'released':'preflight')+'.json',JSON.stringify(report,null,2));
console.log(JSON.stringify({...report,results:undefined}));
