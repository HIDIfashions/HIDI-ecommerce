import assert from 'node:assert/strict';
import { writeFile, mkdir } from 'node:fs/promises';
import publishedImages from './published-product-images.json' with {type:'json'};
import reviewedImages from './reviewed-product-image-map.json' with {type:'json'};
import { identityUrl } from './metadata.mjs';
import { productImageUrls } from './sitemap.mjs';

const base='https://hidiindia.com';
assert.equal(new Set(publishedImages).size,publishedImages.length,'Published image allowlist must be unique');
assert.deepEqual(publishedImages,[...publishedImages].sort(),'Published image allowlist must be sorted');
async function read(url,options={}) {
  let error;
  for(let attempt=0;attempt<4;attempt++) {
    try {
      const response=await fetch(url,{...options,signal:AbortSignal.timeout(30000)});
      if(![429,500,502,503,504].includes(response.status)||attempt===3)return response;
      await response.body?.cancel();
    } catch(failure) {
      error=failure;
      if(attempt===3)throw failure;
    }
    await new Promise(resolve=>setTimeout(resolve,500*(attempt+1)));
  }
  throw error;
}
function validatedProductImagePaths(product) {
  const paths=new Set();
  for(const image of [...(product.images||[]),...(product.variants||[]).flatMap(v=>v.images||[])]) {
    const url=new URL(identityUrl(image.url),base);
    assert.equal(url.origin,base,'Catalogue image must resolve to the verified production origin');
    assert(!url.search&&!url.hash&&!url.username&&!url.password,'No signed or credential-bearing image URLs');
    assert(/^\/media\/products\/variants\/[A-Za-z0-9_-]+\/[A-Za-z0-9._-]+\.(?:jpe?g|png|webp|avif)$/i.test(url.pathname),'Public product-image path required');
    paths.add(url.pathname);
  }
  return [...paths].sort();
}
const response=await read(base+'/api/store/products');
assert.equal(response.status,200);
const summaries=await response.json();
assert(Array.isArray(summaries)&&summaries.length>0,'Expected the public catalogue summary');
const details=new Array(summaries.length);
let detailCursor=0;
await Promise.all(Array.from({length:6},async()=>{
  while(detailCursor<summaries.length) {
    const index=detailCursor++;
    const summary=summaries[index];
    assert.equal(typeof summary?.id,'string','Published product ID required');
    assert.match(summary?.slug||'',/^[a-z0-9]+(?:-[a-z0-9]+)*$/,'Published product slug required');
    assert(!summary.status||summary.status==='ACTIVE','Only active catalogue summaries may be discovered');
    const detailResponse=await read(base+'/api/store/products/'+encodeURIComponent(summary.slug));
    assert.equal(detailResponse.status,200,'Product detail must be reachable: '+summary.slug);
    const detail=await detailResponse.json();
    assert.equal(detail?.id,summary.id,'Product detail ID must match catalogue summary');
    assert.equal(detail?.slug,summary.slug,'Product detail slug must match catalogue summary');
    assert(!detail.status||detail.status==='ACTIVE','Only active public products may be discovered');
    details[index]=detail;
  }
}));
assert.equal(new Set(details.map(product=>product.id)).size,details.length,'Published product IDs must be unique');
assert.equal(new Set(details.map(product=>product.slug)).size,details.length,'Published product slugs must be unique');
assert.deepEqual(details.map(product=>product.slug).sort(),Object.keys(reviewedImages).sort(),'Reviewed product coverage changed');
const current=new Set();
for(const product of details) {
  if(product.status&&product.status!=='ACTIVE')continue;
  const paths=validatedProductImagePaths(product);
  assert.equal(reviewedImages[product.slug].id,product.id,'Reviewed product identity changed: '+product.slug);
  assert.deepEqual(paths,[...reviewedImages[product.slug].paths].sort(),'Reviewed product images changed: '+product.slug);
  for(const path of paths)current.add(path);
}
assert.deepEqual([...current].sort(),[...publishedImages].sort(),'Published image associations changed; refresh before release');
const requireIndex=process.argv.includes('--released');
let cursor=0;const results=[],failures=[];
await Promise.all(Array.from({length:4},async()=>{
  while(cursor<publishedImages.length) {
    const path=publishedImages[cursor++];
    try {
      const res=await read(base+path,{method:'HEAD',redirect:'manual'});
      assert.equal(res.status,200,path+' is reachable');
      assert(res.headers.get('content-type')?.startsWith('image/'),path+' retains image MIME');
      if(requireIndex)assert(!res.headers.get('x-robots-tag')?.includes('noindex'),path+' is eligible for image indexing');
      results.push({path,status:res.status,robots:res.headers.get('x-robots-tag')});
    } catch(error) { failures.push({path,error:String(error)}); }
  }
}));
const report={passed:failures.length===0,summaryCount:summaries.length,productCount:details.length,imageCount:results.length,failures,
  productImageAssociations:details.reduce((n,p)=>n+productImageUrls(p).length,0),
  requireIndex,readOnly:true,databaseWrites:0,blobWrites:0,checkedAt:new Date().toISOString(),results};
await mkdir('evidence/seo-discovery',{recursive:true});
await writeFile('evidence/seo-discovery/image-discovery-'+(requireIndex?'released':'preflight')+'.json',JSON.stringify(report,null,2));
console.log(JSON.stringify({...report,results:undefined}));
assert.equal(failures.length,0,'Every approved image must pass; review the recorded failed paths');
