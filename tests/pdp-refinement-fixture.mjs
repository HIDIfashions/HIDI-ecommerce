import http from 'node:http';
import {readFileSync} from 'node:fs';
const product=JSON.parse(readFileSync(new URL('./fixtures/pdp-refinement/product.json',import.meta.url)));
const reviews={averageRating:0,reviewCount:0,verifiedReviewCount:0,ratingDistribution:{1:0,2:0,3:0,4:0,5:0},reviews:[]};
http.createServer((req,res)=>{res.setHeader('Content-Type','application/json');if(req.method!=='GET'){res.writeHead(405);res.end('{}');return;}
 const path=new URL(req.url,'http://localhost').pathname;
 let data=path===`/v1/products/${product.slug}`?product:path.includes('/reviews/products/')?reviews:path.endsWith('/related')?[]:path==='/v1/products'?[product]:path==='/v1/categories'?[product.category]:path==='/v1/collections'?product.collections:[];
 res.end(JSON.stringify(data));
}).listen(4000,'127.0.0.1',()=>console.log('Read-only PDP fixture on 4000'));
