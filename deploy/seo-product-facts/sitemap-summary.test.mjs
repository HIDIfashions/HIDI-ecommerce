import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import {sitemapXml} from '../seo-discovery/sitemap.mjs';
const map=JSON.parse(readFileSync(new URL('../seo-discovery/reviewed-product-image-map.json',import.meta.url)));
test('summary catalogue retains all reviewed images only for matching published identities',()=>{
 assert.equal(Object.keys(map).length,54);
 const products=Object.entries(map).map(([slug,p])=>({slug,id:p.id,status:'ACTIVE',images:[],variants:[]}));
 const xml=sitemapXml(products);
 const paths=new Set(Object.values(map).flatMap(p=>p.paths));assert.equal(paths.size,238);
 for(const path of paths)assert(xml.includes('https://hidiindia.com'+path));
 const [slug,p]=Object.entries(map).find(([,p])=>p.paths.length);
 for(const product of [{slug,id:'different',images:[]},{slug,id:p.id,status:'DRAFT',images:[]}]){
  const restricted=sitemapXml([product]);for(const path of p.paths)assert(!restricted.includes(path));
 }
});
