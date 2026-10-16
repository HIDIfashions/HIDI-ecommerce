import { parseSheet, detailsPayload, pricePaise } from './product-sheet.mjs';
const $ = id => document.getElementById(id);
const fieldLabels = { name:'Product name', categoryId:'Category', shortDescription:'Short description', fabric:'Fabric', care:'Wash care', description:'Full product details' };
let record = null, options = { categories:[] }, fields = {}, selected = new Set(), busy = false, ready = false, requestId = null;
function say(text, type = '') { $('status').textContent = text; $('status').className = 'notice '+type; }
function lock(value) { busy=value; for (const id of ['new','searchButton','preview','save']) $(id).disabled=value||!ready; }
async function api(path, method='GET', body) {
  const response=await fetch('/api/admin/products'+path,{method,cache:'no-store',credentials:'same-origin',...(body?{headers:{'content-type':'application/json'},body:JSON.stringify(body)}:{})});
  const data=await response.json().catch(()=>({}));
  if(!response.ok){if(response.status===401||response.status===403)$('auth').hidden=false; throw new Error(Array.isArray(data.message)?data.message.join('. '):data.message||'Unable to complete product request.');}
  return data;
}
async function run(work){if(busy)return;lock(true);try{await work();}catch(e){say(e.message,'bad');}finally{lock(false);}}
function setTarget(next){record=next;requestId=null;$('price').value='';$('mrp').value='';$('target').textContent=next?'Updating: '+next.name+' · '+next.status:'Creating a new draft';$('target').classList.toggle('selected',Boolean(next));$('review').hidden=true;$('results').replaceChildren();$('openEditor').hidden=true;}
function review(){
  const parsed=parseSheet($('source').value);fields={...parsed.fields};selected=new Set(Object.keys(fields));
  if(parsed.category){const match=options.categories.find(c=>c.name.toLowerCase()===parsed.category.toLowerCase());if(match){fields.categoryId=match.id;selected.add('categoryId');}else parsed.warnings.push('Category “'+parsed.category+'” has no exact match. Choose one below if needed.');}
  $('fields').replaceChildren();
  for(const [key,label] of Object.entries(fieldLabels)){
    const box=document.createElement('div');if(key==='description')box.className='wide';
    const title=document.createElement('label'),check=document.createElement('input');check.type='checkbox';check.checked=selected.has(key);check.setAttribute('aria-label','Save '+label);check.onchange=()=>{if(check.checked)selected.add(key);else selected.delete(key);};title.append(check,' '+label);box.append(title);
    const el=document.createElement(key==='categoryId'?'select':['description','care','shortDescription'].includes(key)?'textarea':'input');el.id='field-'+key;el.setAttribute('aria-label',label);
    if(key==='categoryId'){const empty=new Option('Choose category (optional)','');el.append(empty);for(const c of options.categories)el.append(new Option(c.name,c.id));}
    if(el.tagName==='TEXTAREA')el.rows=key==='description'?12:3;
    el.value=fields[key]??record?.[key]??'';fields[key]=el.value;
    el.oninput=()=>{fields[key]=el.value;selected.add(key);check.checked=true;};box.append(el);
    if(record){const previous=document.createElement('div');previous.className='previous';previous.textContent='Current: '+(key==='categoryId'?record.category?.name||'—':record[key]||'—');box.append(previous);}
    $('fields').append(box);
  }
  $('warnings').textContent=parsed.warnings.join(' ')||'Details found. Review the text before saving.';
  $('draftFields').hidden=Boolean(record);$('color').value=parsed.color.length<=40?parsed.color:'';$('sizes').value=parsed.sizes.join(', ');
  if(parsed.color.length>40)$('warnings').textContent+=' The colour description is long; enter a short colour name for the SKUs.';
  $('saveSummary').textContent=record?'Save to '+record.name+'. Existing prices, sizes, SKUs, stock, photos, collections and publishing status are retained.':'Create a draft. Prices and sizes require your review; stock starts at zero.';
  $('review').hidden=false;$('openEditor').hidden=true;$('review').scrollIntoView({behavior:'smooth',block:'start'});
}
$('preview').onclick=()=>{try{review();say('Preview ready. Nothing has been saved.');}catch(e){say(e.message,'bad');}};
$('new').onclick=()=>{if(!$('review').hidden&&!window.confirm('Discard the current review and start a new draft?'))return;setTarget(null);};
$('searchForm').onsubmit=e=>{e.preventDefault();void run(async()=>{
  const body=await api('?q='+encodeURIComponent($('search').value.trim()));$('results').replaceChildren();
  for(const p of body.items||[]){const b=document.createElement('button');b.type='button';b.textContent=p.name+' · '+p.status;b.onclick=()=>run(async()=>{setTarget(await api('/'+encodeURIComponent(p.id)));say('Product selected. Paste its details below.');});$('results').append(b);}
  if(!body.items?.length)$('results').textContent='No matching product. Try its name or HIDI SKU.';
  if(body.total>(body.items?.length||0))$('results').append(document.createTextNode('Showing the first '+body.items.length+' matches. Narrow the search to find your product.'));
});};
$('review').onsubmit=e=>{e.preventDefault();void run(async()=>{
  const body=detailsPayload(record,fields,selected);if(!body.name?.trim())throw new Error('Product name is required. Tick and fill Product name.');
  if(record){if(!selected.size)throw new Error('Select at least one field to save.');}
  else{
    const sizes=[...new Set($('sizes').value.split(',').map(v=>v.trim().toUpperCase()).filter(Boolean))],color=$('color').value.trim();
    if(!color||!sizes.length)throw new Error('Enter a colour and at least one size.');
    const price=pricePaise($('price').value),mrp=pricePaise($('mrp').value);if(price>mrp)throw new Error('Selling price cannot exceed MRP.');
    requestId??=crypto.randomUUID();Object.assign(body,{colors:[{name:color,hex:null}],sizes,pricePaise:price,mrpPaise:mrp,weightGrams:null,requestId});
  }
  const saved=await api(record?'/'+encodeURIComponent(record.id):'',record?'PATCH':'POST',body);record=saved;
  $('target').textContent='Saved: '+saved.name+' · '+saved.status;$('review').hidden=true;$('openEditor').hidden=false;
  const link=document.createElement('a');link.className='button';link.href='/admin/products/'+encodeURIComponent(saved.id);link.textContent='Open product editor / add photos';$('status').replaceChildren(document.createTextNode('Product details saved. '),link);$('status').className='notice good';
});};
window.addEventListener('beforeunload',e=>{if(!$('review').hidden){e.preventDefault();e.returnValue='';}});
void run(async()=>{options=await api('/options');const id=new URL(location.href).searchParams.get('product');if(id){setTarget(await api('/'+encodeURIComponent(id)));}else setTarget(null);ready=true;say('Ready. Select a product or create a draft, then paste its details.');});
