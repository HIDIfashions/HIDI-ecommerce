// Local review sandbox. No production API calls; edits stay in process memory.
import {createServer} from 'node:http';
import {readFile,readdir} from 'node:fs/promises';
import {resolve,basename} from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseSheet} from '../admin-tools/product-sheet.mjs';
import {parseEdit} from '../../apps/api/src/admin/products/product-input.ts';
const here=fileURLToPath(new URL('.',import.meta.url)), root=resolve(here,'../..'), photoRoot=resolve(root,'../catalog-preparation');
async function supplierSnapshot(){
 const source=JSON.parse(await readFile(resolve(photoRoot,'source-products.json'),'utf8'));const names=await readdir(resolve(photoRoot,'photos'));
 return source.map((row,index)=>{const parsed=parseSheet(row.lines.map(line=>line.replace(' | ','\t')).join('\n')),id='snapshot-'+index,photos=names.filter(n=>n.startsWith(row.sku+'_')).map((name,i)=>({id:id+'-image-'+i,url:'/snapshot-photo/'+name,alt:parsed.fields.name||row.sku,position:i}));
 if(!photos.length&&row.reference_image)photos.push({id:id+'-ref',url:'/snapshot-reference/'+basename(row.reference_image),alt:parsed.fields.name||row.sku,position:0});
 return {id,skn:row.sku,name:parsed.fields.name||row.sku,slug:id,status:'DRAFT',categoryId:null,category:null,shortDescription:parsed.fields.shortDescription||null,description:parsed.fields.description||null,fabric:parsed.fields.fabric||null,care:parsed.fields.care||null,collections:[],updatedAt:'2026-10-16T00:00:00.000Z',images:photos,variants:(parsed.sizes.length?parsed.sizes:['M','L','XL']).map((size,i)=>({id:id+'-'+i,sku:row.sku+'-'+size,size,color:parsed.color||'See product photo',active:true,pricePaise:Math.round((row.selling_price||0)*100),mrpPaise:Math.round((row.selling_price||0)*100),images:[],inventory:{onHand:0,reserved:0}}))};});
}
export async function snapshot(){
 try {
  const rows=JSON.parse(await readFile(resolve(root,'../seo-preparation/merchant-products-detail.json'),'utf8'));
  return rows.map(p=>({...p,status:'ACTIVE',categoryId:p.category?.id||null,collections:(p.collections||[]).map(c=>({collectionId:c.id,collection:c})),updatedAt:'2026-10-16T00:00:00.000Z',variants:p.variants.map(v=>({...v,active:true,images:v.images||[],inventory:{onHand:v.available||0,reserved:0}}))}));
 }catch(error){if(error.code==='ENOENT')return supplierSnapshot();throw error;}
}
export async function createPreviewServer(records){
 records ??= await snapshot();
 const products=new Map(records.map(p=>[p.id,structuredClone(p)])),writes=[];
 const server=createServer(async(req,res)=>{try{const url=new URL(req.url,'http://localhost'),path=url.pathname;const json=(status,body)=>{res.writeHead(status,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify(body));};
 if(path==='/api/admin/products'){
 if(req.method!=='GET')return json(405,{message:'Method not allowed'});
 const q=(url.searchParams.get('q')||'').toLowerCase(),status=url.searchParams.get('status')||'ALL',page=Math.max(1,Number(url.searchParams.get('page'))||1),pageSize=20;
 const items=[...products.values()].filter(p=>(status==='ALL'||p.status===status)&&(!q||[p.name,p.slug,p.skn,...p.variants.map(v=>v.sku)].some(s=>s?.toLowerCase().includes(q))));
 return json(200,{items:items.slice((page-1)*pageSize,page*pageSize).map(p=>({...p,imageUrl:p.images[0]?.url})),total:items.length,page,pageSize});}
 if(path.startsWith('/api/admin/products/')){const id=decodeURIComponent(path.split('/').at(-1)),p=products.get(id);if(!p)return json(404,{message:'Product not found'});if(req.method==='GET')return json(200,p);
 if(req.method==='PATCH'){let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>50000)return json(413,{message:'Request too large'});}const body=JSON.parse(raw);parseEdit(body);if(body.expectedUpdatedAt!==p.updatedAt)return json(409,{message:'Product changed since you opened it. Reload before saving.'});writes.push({id,body});const next={...p,...body,updatedAt:new Date(Date.parse(p.updatedAt)+1).toISOString()};delete next.expectedUpdatedAt;products.set(id,next);return json(200,next);}return json(405,{message:'Method not allowed'});}
 let file,type;
 if(path==='/'||path==='/admin/product-preview'){file=resolve(here,'../admin-tools/product-preview.html');type='text/html';}
 else if(path.startsWith('/admin-tools-assets/')){const name=path.slice('/admin-tools-assets/'.length);if(!['product-photo-framing.mjs','admin-tools.css','product-preview.css','product-preview.mjs','product-copy.mjs'].includes(name))return json(404,{});file=resolve(here,'../admin-tools',name);type=name.endsWith('.css')?'text/css':'text/javascript';}
 else if(path.startsWith('/snapshot-photo/')){const name=path.slice('/snapshot-photo/'.length);if(basename(name)!==name)return json(404,{});file=resolve(photoRoot,'photos',name);type='image/jpeg';}
 else if(path.startsWith('/snapshot-reference/')){const name=path.slice('/snapshot-reference/'.length);if(basename(name)!==name)return json(404,{});file=resolve(photoRoot,name);type='image/png';}
 else return json(404,{message:'Local review sandbox'});
 let data=await readFile(file);if(type==='text/html')data=Buffer.from(data.toString().replace('<main class="wrap">','<main class="wrap"><p class="notice"><strong>LOCAL REVIEW SANDBOX</strong> · Saved catalogue snapshot, not current production data. Saves stay in this local session. Live products are unchanged.</p>'));
 res.writeHead(200,{'content-type':type,'cache-control':'no-store'});res.end(data);
 }catch(error){res.writeHead(400,{'content-type':'application/json'});res.end(JSON.stringify({message:error.message}));}});
 return {server,products,writes};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){const {server}=await createPreviewServer();server.listen(Number(process.env.PORT||4318),'127.0.0.1',()=>console.log('Local catalogue review: http://127.0.0.1:'+server.address().port+'/admin/product-preview'));}
