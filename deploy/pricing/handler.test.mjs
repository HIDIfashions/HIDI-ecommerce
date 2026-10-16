import test from 'node:test';import assert from 'node:assert/strict';import {createPricingHandler} from './handler.mjs';
test('private pricing page rejects guest and staff; assets contain no private catalogue',async()=>{
 const h=createPricingHandler({origin:'http://localhost',requestFetch:async(u,o)=>Response.json({admin:{role:o.headers.cookie==='owner=1'?'OWNER':'STAFF'}})});
 for(const [cookie,status]of [[undefined,401],['staff=1',403],['owner=1',200]]){let code,body;await h({method:'GET',headers:{cookie}},{writeHead:s=>code=s,end:b=>body=b},'/admin/product-pricing');assert.equal(code,status);if(status===200)assert.match(body.toString(),/Published product pricing/);}
 let code;await h({method:'POST',headers:{}},{writeHead:s=>code=s,end:()=>{}},'/pricing-assets/model.mjs');assert.equal(code,405);
 assert.equal(await h({method:'GET',headers:{}},{},'/pricing-assets/../admin.html'),false);
});
