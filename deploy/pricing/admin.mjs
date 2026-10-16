import { priceStatus, target15, variantPayload } from './model.mjs';
const $ = id => document.getElementById(id), rupees = n => (n / 100).toFixed(2);
let products = [], busy = false, dirty = new Set();
const inputs = new Map();
const say = (text, error=false) => { $('status').textContent = text; $('status').classList.toggle('error',error); };
async function api(path='', options={}) {
  const r = await fetch('/api/admin/products'+path,{credentials:'same-origin',cache:'no-store',...options});
  const data = await r.json().catch(()=>({}));
  if (!r.ok) { if ([401,403].includes(r.status)) $('auth').hidden=false; throw Error(data.message || 'Price request failed ('+r.status+').'); }
  return data;
}
function lock(value) { busy=value; for (const el of document.querySelectorAll('button,input,select')) el.disabled=value; }
function summary() {
  const variants=products.flatMap(p=>p.variants.filter(v=>v.active)), ready=variants.filter(v=>priceStatus(v.mrpPaise,v.pricePaise).exact15).length;
  $('summary').textContent=products.length+' published products · '+variants.length+' active variants · '+ready+' exactly 15% off · '+(variants.length-ready)+' need review · '+dirty.size+' unsaved rows';
}
function render() {
  $('rows').replaceChildren(); inputs.clear();
  const q=$('search').value.trim().toLowerCase(), filter=$('filter').value;
  for(const p of products) for(const v of p.variants) {
    if(!v.active) continue;
    const state=priceStatus(v.mrpPaise,v.pricePaise);
    if(q&&![p.name,p.skn,v.sku,v.color,v.size].join(' ').toLowerCase().includes(q))continue;
    if(filter==='ready'&&!state.exact15||filter==='mismatch'&&state.exact15)continue;
    const row=document.createElement('tr'),cell=text=>{const td=document.createElement('td');td.textContent=text;row.append(td);return td;};
    const name=cell(''),a=document.createElement('a');a.href='/admin/products/'+encodeURIComponent(p.id);a.textContent=p.name;name.append(a,document.createElement('br'),'SKN '+(p.skn||'—')+' · '+v.sku);
    cell(v.color+' / '+v.size);
    const fields={};
    for(const [key,label,value] of [['mrp','MRP',v.mrpPaise],['price','Selling price',v.pricePaise]]) {
      const el=document.createElement('input');el.type='text';el.inputMode='decimal';el.value=rupees(value);el.setAttribute('aria-label',label+' for '+v.sku);fields[key]=el;cell('').append(el);
      el.oninput=()=>{dirty.add(v.id);summary();};
    }
    cell(state.valid?state.percent.toFixed(2)+'%'+(state.exact15?' · Ready':''):'Invalid prices');
    const suggestion=cell(rupees(target15(v.mrpPaise))),action=cell(''),target=document.createElement('button'),save=document.createElement('button'),feedback=document.createElement('span');
    target.type=save.type='button';target.textContent='Use 15% target';save.textContent='Save row';feedback.setAttribute('role','status');
    target.onclick=()=>{try{const body=variantPayload(p,v,fields.mrp.value,fields.price.value);fields.price.value=rupees(target15(body.mrpPaise));suggestion.textContent=fields.price.value;dirty.add(v.id);summary();}catch(e){feedback.textContent=e.message;}};
    save.onclick=async()=>{
      if(busy)return;
      let body;try{body=variantPayload(p,v,fields.mrp.value,fields.price.value);}catch(e){feedback.textContent=e.message;return;}
      if(body.mrpPaise===v.mrpPaise&&body.pricePaise===v.pricePaise){dirty.delete(v.id);feedback.textContent='Already saved.';summary();return;}
      lock(true);feedback.textContent='Saving…';
      try{
        const saved=await api('/'+encodeURIComponent(p.id)+'/variants/'+encodeURIComponent(v.id),{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
        if(!saved.id||!saved.updatedAt||!Array.isArray(saved.variants))throw Error('Incomplete save response. Reload to confirm before retrying.');
        products=products.map(item=>item.id===saved.id?saved:item);dirty.delete(v.id);
        // Preserve unsaved edits in other rows while updating the revision for this product.
        const drafts=new Map([...inputs].filter(([id])=>dirty.has(id)).map(([id,f])=>[id,{mrp:f.mrp.value,price:f.price.value}]));
        render();for(const [id,values]of drafts){const f=inputs.get(id);if(f){f.mrp.value=values.mrp;f.price.value=values.price;}}
        say('Saved '+v.sku+'. Other rows and product details are unchanged.');
      }catch(e){feedback.textContent=e.message+' Your edits are still here. Reload to confirm before retrying.';say('Save was not confirmed. '+e.message,true);}
      finally{lock(false);}
    };
    action.append(target,save,feedback);inputs.set(v.id,fields);$('rows').append(row);
  }
  summary();
}
async function load() {
  if(busy)return;if(dirty.size&&!confirm('Reload and discard unsaved price edits?'))return;
  lock(true);say('Loading every published product. Prices are unchanged.');
  try {
    const list=[];let page=1,total=Infinity;
    while(list.length<total){const result=await api('?status=ACTIVE&page='+page++);if(!Array.isArray(result.items)||!Number.isInteger(result.total))throw Error('Incomplete published-product list.');total=result.total;if(!result.items.length&&list.length<total)throw Error('Published-product list changed. Reload.');list.push(...result.items);}
    const next=[];for(const p of list){const detail=await api('/'+encodeURIComponent(p.id));if(detail.status==='ACTIVE')next.push(detail);}
    if(new Set(next.map(p=>p.id)).size!==next.length)throw Error('Products changed during loading. Reload.');
    products=next;dirty.clear();render();$('export').disabled=false;say('All published prices loaded. Nothing has been changed.');
  }catch(e){say(e.message,true);}finally{lock(false);}
}
function applyFilter(){if(dirty.size){say('Save or reload your unsaved rows before filtering.',true);return;}render();}
$('search').oninput=applyFilter;$('filter').onchange=applyFilter;$('reload').onclick=load;
$('export').onclick=()=>{
  const csv=value=>'"'+String(value??'').replace(/"/g,'""').replace(/^[=+@-]/,"'$&")+'"';
  const rows=[['Product','SKN','SKU','Colour','Size','MRP INR','Selling INR','Discount percent','15% target INR']];
  for(const p of products)for(const v of p.variants.filter(v=>v.active))rows.push([p.name,p.skn,v.sku,v.color,v.size,rupees(v.mrpPaise),rupees(v.pricePaise),priceStatus(v.mrpPaise,v.pricePaise).percent?.toFixed(4)??'',rupees(target15(v.mrpPaise))]);
  const url=URL.createObjectURL(new Blob(['\ufeff'+rows.map(r=>r.map(csv).join(',')).join('\r\n')],{type:'text/csv'})),a=document.createElement('a');a.href=url;a.download='hidi-published-price-audit.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
};
window.addEventListener('beforeunload',e=>{if(dirty.size||busy){e.preventDefault();e.returnValue='';}});
load();
