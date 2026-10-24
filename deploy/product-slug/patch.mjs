import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
const source=readFileSync(new URL('../admin-tools/product-batch.mjs',import.meta.url),'utf8');
const helper=source.match(/function newProductSlug\(name,supplied\)\{[\s\S]*?\n\}/)?.[0];
assert(helper,'Reviewed slug helper required');
function once(text,old,value){assert.equal(text.split(old).length,2,'Expected one patch anchor: '+old);return text.replace(old,value);}
export function patch(name,text){
  if(name==='product-batch.mjs'){
    const line=text.split('\n').find(line=>line.startsWith('export const slugify='));assert(line);
    text=once(text,line,line+'\n'+helper);
    return once(text,"const slug=item.slug||slugify(body.name);if(!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)||slug.length>100)throw new Error('Set a valid product_slug in the file.');",'const slug=newProductSlug(body.name,item.slug);');
  }
  if(name==='product-bulk.mjs')return once(text,"'create draft':'update selected details'","'create draft · Product URL: /products/'+payloads[i].slug:'update selected details'");
  if(name==='product-bulk.html')return once(text,'Blank details keep current values.','Blank details keep current values. New product URLs are generated from the product name when product_slug is blank or invalid; valid custom slugs are kept.');
  throw new Error('Unapproved file '+name);
}
export const names=['product-batch.mjs','product-bulk.mjs','product-bulk.html'];
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const [base,overlay]=process.argv.slice(2);assert(base&&overlay);
  for(const name of names){const target=resolve(overlay,'admin-tools',name);mkdirSync(dirname(target),{recursive:true});writeFileSync(target,patch(name,readFileSync(resolve(base,'admin-tools',name),'utf8')));}
}
