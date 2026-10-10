import {publicationState,publishProducts} from './product-publication.mjs';
const LAST_BATCH='hidi-bulk-publish-ids-v1';
let root,rows=[],busy=false,externalBusy=false,pendingReview=false,ids=[];
try { const value=JSON.parse(sessionStorage.getItem(LAST_BATCH)||'[]'); if(Array.isArray(value)) ids=value.filter(id=>typeof id==='string').slice(0,500); } catch {}
const $=id=>root.querySelector('[data-publish="'+id+'"]');
async function api(path='',method='GET',body) {
  const response=await fetch('/api/admin/products'+path,{method,credentials:'same-origin',cache:'no-store',headers:body?{'content-type':'application/json'}:undefined,body:body?JSON.stringify(body):undefined});
  const data=await response.json().catch(()=>({}));
  if(!response.ok){const error=new Error(Array.isArray(data.message)?data.message.join('. '):data.message||'Request failed ('+response.status+').');error.status=response.status;throw error;}
  return data;
}
function say(text){$('status').textContent=text;}
function lock(value){busy=value;for(const button of root.querySelectorAll('button,input'))button.disabled=value||externalBusy;render();}
function render(){
  const body=$('rows');body.replaceChildren();
  for(const row of rows){
    const line=document.createElement('tr'),pick=document.createElement('td'),name=document.createElement('td'),state=document.createElement('td');
    const input=document.createElement('input');input.type='checkbox';input.checked=!!row.selected;input.disabled=busy||externalBusy||!row.ready;input.setAttribute('aria-label','Publish '+row.name);input.onchange=()=>{row.selected=input.checked;updateCount();};pick.append(input);
    name.textContent=row.name;state.textContent=row.message;state.dataset.publishState=row.state;line.append(pick,name,state);body.append(line);
  }
  $('table').hidden=!rows.length;$('last').disabled=busy||externalBusy||!ids.length;updateCount();
}
function updateCount(){const count=rows.filter(row=>row.selected&&row.ready).length;$('publish').textContent='Publish selected products'+(count?' ('+count+')':'');$('publish').disabled=busy||externalBusy||!count;$('select').disabled=busy||externalBusy||!rows.some(row=>row.ready);$('drafts').disabled=busy||externalBusy;}
async function review(batchIds){
  if(busy)return;if(externalBusy){pendingReview=true;return;}lock(true);rows=[];say('Checking saved details, prices and photos…');
  try{
    for(const id of [...new Set(batchIds)]){
      try{const product=await api('/'+encodeURIComponent(id));rows.push({id,name:product.name,...publicationState(product),selected:false});}
      catch(error){rows.push({id,name:id,ready:false,state:'failed',message:error.message});if([401,403].includes(error.status))throw error;}
    }
    say(rows.filter(row=>row.ready).length+' ready to publish. Select products below, then publish the batch. Products without photos stay in Draft.');
  }catch(error){say(error.message);}finally{lock(false);}
}
async function loadDrafts(){
  if(busy||externalBusy)return;lock(true);let found=[];
  try{for(let page=1;;page++){const batch=await api('?'+new URLSearchParams({status:'DRAFT',page:String(page)}));if(!Array.isArray(batch.items))throw new Error('Draft list response is incomplete.');found.push(...batch.items.map(row=>row.id));if(found.length>=batch.total||!batch.items.length)break;if(found.length>500)throw new Error('More than 500 drafts. Review your latest imported batch instead.');}say('Loading '+found.length+' drafts…');}
  catch(error){say(error.message);found=null;}finally{lock(false);}
  if(found)await review(found);
}
function mount(){
  if(!['/admin/import','/admin/product-bulk'].includes(location.pathname.replace(/\/$/,'')))return;
  const heading=[...document.querySelectorAll('main h1')].find(node=>['Import products, stock & photography','Bulk Product Details'].includes(node.textContent.trim()));
  const main=heading?.closest('main');if(!main||document.getElementById('hidi-bulk-publish'))return;
  root=document.createElement('section');root.id='hidi-bulk-publish';root.setAttribute('aria-labelledby','hidi-bulk-publish-title');
  root.innerHTML='<h2 id="hidi-bulk-publish-title">Publish products in bulk</h2><p>Import and save your product details, upload the photos, then publish the ready products together. You do not need to open and save each product.</p><div class="hidi-publish-actions"><button type="button" data-publish="last">Review latest imported batch</button><button type="button" data-publish="drafts">Load draft products</button><button type="button" data-publish="select">Select all ready products</button><button type="button" data-publish="publish">Publish selected products</button></div><p role="status" aria-live="polite" data-publish="status">Review a batch to check which products are ready.</p><div class="hidi-publish-table"><table data-publish="table" hidden><thead><tr><th>Select</th><th>Product</th><th>Publication status</th></tr></thead><tbody data-publish="rows"></tbody></table></div>';
  const style=document.createElement('style');style.textContent='#hidi-bulk-publish{margin:24px 0;padding:20px;border:1px solid #dccfc4;border-radius:12px;background:#fff;color:#352320;box-sizing:border-box;min-width:0}#hidi-bulk-publish h2{margin:0 0 10px;font-size:20px}#hidi-bulk-publish p{line-height:1.6;overflow-wrap:anywhere}.hidi-publish-actions{display:flex;flex-wrap:wrap;gap:10px}#hidi-bulk-publish button{font:inherit;padding:10px 14px;min-height:44px;border-radius:7px;border:1px solid #6c3337;background:#591d20;color:#fff;cursor:pointer}#hidi-bulk-publish button:disabled{opacity:.5;cursor:default}.hidi-publish-table{overflow-x:auto}#hidi-bulk-publish table{width:100%;border-collapse:collapse}#hidi-bulk-publish th,#hidi-bulk-publish td{padding:10px;text-align:left;border-bottom:1px solid #e8ddd5;overflow-wrap:anywhere}#hidi-bulk-publish input{width:20px;height:20px}#hidi-bulk-publish [data-publish-state="failed"],#hidi-bulk-publish [data-publish-state="blocked"]{color:#a12626}#hidi-bulk-publish [data-publish-state="published"]{color:#166038}';root.prepend(style);main.append(root);
  $('last').onclick=()=>review(ids);$('drafts').onclick=loadDrafts;$('select').onclick=()=>{for(const row of rows)row.selected=row.ready;render();};
  $('publish').onclick=async()=>{
    if(busy||externalBusy)return;const selected=rows.filter(row=>row.selected&&row.ready).map(row=>row.id);
    if(!selected.length||!window.confirm('Publish '+selected.length+' selected products on the website and mobile?'))return;
    lock(true);say('Publishing selected products…');
    try{const results=await publishProducts(selected,api,(result,count)=>{const row=rows.find(row=>row.id===result.id);Object.assign(row,result,{selected:false});render();say('Checked '+count+' of '+selected.length+' products…');});const published=results.filter(row=>row.state==='published').length;say(published+' published. '+(selected.length-published)+' not published. Review any errors, correct prices or upload photos, and review this batch to retry.');}
    catch(error){say(error.message);}finally{lock(false);}
  };
  render();
}
window.addEventListener('hidi:bulk-products-saved',event=>{
  if(!Array.isArray(event.detail?.ids))return;ids=[...new Set(event.detail.ids.filter(id=>typeof id==='string'))].slice(0,500);
  try{sessionStorage.setItem(LAST_BATCH,JSON.stringify(ids));}catch{}
  mount();if(root&&!busy){render();void review(ids);}
});
window.addEventListener('hidi:bulk-photos-saved',()=>{if(root&&ids.length&&!busy)void review(ids);});
window.addEventListener('hidi:bulk-busy',event=>{externalBusy=event.detail?.busy===true;if(root)render();if(!externalBusy&&pendingReview&&root&&!busy){pendingReview=false;void review(ids);}});
let scheduled=false;new MutationObserver(()=>{if(scheduled)return;scheduled=true;requestAnimationFrame(()=>{scheduled=false;mount();});}).observe(document.documentElement,{childList:true,subtree:true});mount();
