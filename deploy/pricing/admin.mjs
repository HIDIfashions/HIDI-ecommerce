import { priceStatus, target15, variantPayload, paise, sellingForDiscount } from './model.mjs';
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
  const variants=products.flatMap(p=>p.variants), ready=products.filter(p=>p.variants.length&&p.variants.every(v=>priceStatus(v.mrpPaise,v.pricePaise).exact15)).length;
  $('summary').textContent=products.length+' published products · '+variants.length+' sizes / colours · '+ready+' dresses exactly 15% off · '+(products.length-ready)+' need review · '+dirty.size+' unsaved rows';
}
function render() {
  $('rows').replaceChildren(); inputs.clear();
  const q=$('search').value.trim().toLowerCase(), filter=$('filter').value;
  for(const p of products) {
    if(!p.variants.length)continue;
    const v=p.variants[0], uniform=p.variants.every(item=>item.mrpPaise===v.mrpPaise&&item.pricePaise===v.pricePaise);
    const state=uniform?priceStatus(v.mrpPaise,v.pricePaise):{valid:false,exact15:false};
    if(q&&![p.name,p.skn,...p.variants.flatMap(item=>[item.sku,item.color,item.size])].join(' ').toLowerCase().includes(q))continue;
    if(filter==='ready'&&!state.exact15||filter==='mismatch'&&state.exact15)continue;
    const row=document.createElement('tr'),cell=text=>{const td=document.createElement('td');td.textContent=text;row.append(td);return td;};
    const name=cell(''),a=document.createElement('a');a.href='/admin/products/'+encodeURIComponent(p.id);a.textContent=p.name;name.append(a,document.createElement('br'),'SKN '+(p.skn||'—')+' · '+p.variants.length+' sizes / colours');
    cell([...new Set(p.variants.map(item=>item.size))].join(', ')+' · '+[...new Set(p.variants.map(item=>item.color))].join(', '));
    const fields={};
    for(const [key,label,value] of [['mrp','MRP',uniform?rupees(v.mrpPaise):''],['discount','Discount percent',state.valid?state.percent.toFixed(2):''],['price','Selling price',uniform?rupees(v.pricePaise):'']]) {
      const el=document.createElement('input');el.type='text';el.inputMode='decimal';el.value=value;el.readOnly=key==='price';el.setAttribute('aria-label',label+' for '+p.name);fields[key]=el;cell('').append(el);
      el.oninput=()=>{dirty.add(p.id);try{const mrp=paise(fields.mrp.value);suggestion.textContent=rupees(target15(mrp));fields.price.value=rupees(sellingForDiscount(mrp,fields.discount.value));feedback.textContent='Calculated selling price. Save dress to apply to every size and colour.';}catch(e){fields.price.value='';feedback.textContent=e.message;}summary();};
    }
    cell(state.valid?state.percent.toFixed(2)+'%'+(state.exact15?' · Ready':''):'Different size prices — enter one dress price');
    const suggestion=cell(uniform?rupees(target15(v.mrpPaise)):'—'),action=cell(''),target=document.createElement('button'),save=document.createElement('button'),feedback=document.createElement('span');
    target.type=save.type='button';target.textContent='Use 15% target';save.textContent='Save dress';feedback.setAttribute('role','status');
    target.onclick=()=>{fields.discount.value='15';fields.discount.dispatchEvent(new Event('input'));suggestion.textContent=fields.price.value;};
    save.onclick=async()=>{
      if(busy)return;
      let body;try{body=variantPayload(p,v,fields.mrp.value,fields.price.value);}catch(e){feedback.textContent=e.message;return;}
      if(p.variants.every(item=>body.mrpPaise===item.mrpPaise&&body.pricePaise===item.pricePaise)){dirty.delete(p.id);feedback.textContent='Already saved.';summary();return;}
      lock(true);feedback.textContent='Saving dress…';let completed=0,current=p;
      try{
        // Each response supplies the next product revision. Keep every size's own
        // measurements, weight and availability flags; stop on conflicts or errors.
        for(const original of p.variants){
          const item=current.variants.find(item=>item.id===original.id);
          if(!item)throw Error('Sizes changed. Reload before retrying.');
          const payload=variantPayload(current,item,fields.mrp.value,fields.price.value);
          if(item.mrpPaise===payload.mrpPaise&&item.pricePaise===payload.pricePaise)continue;
          const saved=await api('/'+encodeURIComponent(p.id)+'/variants/'+encodeURIComponent(item.id),{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
          if(saved.id!==p.id||!saved.updatedAt||!Array.isArray(saved.variants))throw Error('Incomplete save response. Reload to confirm before retrying.');
          current=saved;completed++;products=products.map(product=>product.id===saved.id?saved:product);
          feedback.textContent='Saved '+completed+' of '+p.variants.length+' sizes / colours…';
        }
        if(!current.variants.every(item=>item.mrpPaise===body.mrpPaise&&item.pricePaise===body.pricePaise))throw Error('Dress sizes changed during saving. Reload to review.');
        dirty.delete(p.id);
        // Preserve unsaved edits in other rows while updating the revision for this product.
        const drafts=new Map([...inputs].filter(([id])=>dirty.has(id)).map(([id,f])=>[id,{mrp:f.mrp.value,discount:f.discount.value,price:f.price.value}]));
        render();for(const [id,values]of drafts){const f=inputs.get(id);if(f){f.mrp.value=values.mrp;f.discount.value=values.discount;f.price.value=values.price;}}
        say('Saved '+p.name+'. One dress price now applies to all '+p.variants.length+' sizes / colours.');
      }catch(e){feedback.textContent=e.message+' Your edits are still here. Reload to confirm before retrying.';say('Save was not confirmed. '+completed+' sizes / colours updated before stopping. Reload to review and retry the dress. '+e.message,true);}
      finally{lock(false);}
    };
    action.append(target,save,feedback);inputs.set(p.id,fields);$('rows').append(row);
  }
  summary();
}
async function load() {
  if(busy)return;if(dirty.size&&!confirm('Reload and discard unsaved price edits?'))return;
  lock(true);say('Loading every published product. Prices are unchanged.');
  try {
    const list=[];let page=1,total=Infinity;
    while(list.length<total){const result=await api('?status=ACTIVE&page='+page++);if(!Array.isArray(result.items)||!Number.isInteger(result.total))throw Error('Incomplete published-product list.');total=result.total;if(!result.items.length&&list.length<total)throw Error('Published-product list changed. Reload.');list.push(...result.items);}
    const details=new Array(list.length);let cursor=0,loaded=0;
    await Promise.all(Array.from({length:Math.min(4,list.length)},async()=>{while(cursor<list.length){const index=cursor++;details[index]=await api('/'+encodeURIComponent(list[index].id));say('Loading published products '+(++loaded)+' of '+list.length+'. Nothing has been changed.');}}));
    const next=details.filter(detail=>detail.status==='ACTIVE');
    if(new Set(next.map(p=>p.id)).size!==next.length)throw Error('Products changed during loading. Reload.');
    products=next;dirty.clear();render();$('export').disabled=false;say('All published prices loaded. Nothing has been changed.');
  }catch(e){say(e.message,true);}finally{lock(false);}
}
function applyFilter(){if(dirty.size){say('Save or reload your unsaved rows before filtering.',true);return;}render();}
$('search').oninput=applyFilter;$('filter').onchange=applyFilter;$('reload').onclick=load;
$('export').onclick=()=>{
  const csv=value=>'"'+String(value??'').replace(/"/g,'""').replace(/^[=+@-]/,"'$&")+'"';
  const rows=[['Dress','SKN','Sizes','Colours','MRP INR','Selling INR','Discount percent','Status']];
  for(const p of products){const v=p.variants[0];if(!v)continue;const uniform=p.variants.every(item=>item.mrpPaise===v.mrpPaise&&item.pricePaise===v.pricePaise);rows.push([p.name,p.skn,[...new Set(p.variants.map(item=>item.size))].join(' / '),[...new Set(p.variants.map(item=>item.color))].join(' / '),uniform?rupees(v.mrpPaise):'',uniform?rupees(v.pricePaise):'',uniform?(priceStatus(v.mrpPaise,v.pricePaise).percent?.toFixed(4)??''):'',uniform?'Common dress price':'Different size prices — review']);}
  const url=URL.createObjectURL(new Blob(['\ufeff'+rows.map(r=>r.map(csv).join(',')).join('\r\n')],{type:'text/csv'})),a=document.createElement('a');a.href=url;a.download='hidi-published-price-audit.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
};
window.addEventListener('beforeunload',e=>{if(dirty.size||busy){e.preventDefault();e.returnValue='';}});
load();
