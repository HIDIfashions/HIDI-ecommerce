import {readWorkbook} from '/admin-tools-assets/workbook-reader.mjs';
import {parseProducts,reportCsv,canonical,MAX_FILES,MAX_PHOTO_BYTES} from './model.mjs';
import {previewBatch,runBatch} from './engine.mjs';
import {readProductPackage,matchPackagePhotos} from './package.mjs';

const $=id=>document.getElementById(id);
let ready=false,busy=false,stopRequested=false,photos=[],preview=null,report=null,writeIntent=null;
const photoUrls=new Map(),groupNodes=new Map();
const complete=group=>group.execution?.state==='published'||group.execution?.state==='draft'&&writeIntent!=='publish';
const selected=()=>preview?.groups.filter(group=>group.included!==false&&!complete(group))||[];
const completed=()=>preview?.groups.filter(complete)||[];
function savedDrafts(){const included=preview?.groups.filter(group=>group.included!==false)||[];return writeIntent==='draft'&&included.length&&included.every(group=>group.execution?.state==='draft')?included:[];}
const message=(text,type='')=>{$('status').textContent=text;$('status').className='notice'+(type?' '+type:'');};
function authFailure(){ready=false;stopRequested=true;$('auth').hidden=false;$('upload-flow').hidden=true;message('Sign in again before continuing. Your current batch remains in this page.','error');}
async function api(path,method='GET',body){
  const response=await fetch(path,{method,credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(method==='GET'?45000:90000),...(body===undefined?{}:{headers:{'content-type':'application/json'},body:JSON.stringify(body)})});
  const data=await response.json().catch(()=>({}));
  if(!response.ok){if([401,403].includes(response.status))authFailure();throw Object.assign(new Error(Array.isArray(data.message)?data.message.join('. '):data.message||'The product request failed ('+response.status+').'),{status:response.status});}
  return data;
}
function lock(value){
  busy=value;
  $('auth-check').disabled=value;
  for(const input of document.querySelectorAll('#upload-flow input'))input.disabled=value||Boolean(writeIntent)||!ready;
  for(const button of document.querySelectorAll('#upload-flow button'))button.disabled=value||!ready;
  $('stop').hidden=!value||!writeIntent;$('stop').disabled=stopRequested;
  if(!value)refreshActions();
}
async function task(fn){if(busy||!ready)return;lock(true);try{await fn();}catch(error){if([401,403].includes(error.status))authFailure();else message(error.message||'Unable to complete the request.','error');}finally{lock(false);}}
function releasePhotos(){for(const url of photoUrls.values())URL.revokeObjectURL(url);photoUrls.clear();}
function previewUrl(file){if(!file||file.size>MAX_PHOTO_BYTES||file.size<1||!/\.(?:jpe?g|png|webp|avif)$/i.test(file.name))return null;if(!photoUrls.has(file))photoUrls.set(file,URL.createObjectURL(file));return photoUrls.get(file);}
function textNode(tag,text,className){const node=document.createElement(tag);node.textContent=String(text??'');if(className)node.className=className;return node;}
function notices(id,items){const node=$(id);node.hidden=!items.length;node.replaceChildren();if(items.length){const list=document.createElement('ul');for(const item of items)list.append(textNode('li',item));node.append(list);}}
function money(paise){return Number.isFinite(paise)?new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR',maximumFractionDigits:2}).format(paise/100):'Keep current';}
function currentVariant(group,row){return group.record?.variants?.find(variant=>canonical(variant.color)===canonical(row.color)&&canonical(variant.size)===canonical(row.size));}
function fact(parent,label,value){if(value===undefined||value===null||value==='')return;const box=document.createElement('div');box.className='fact';box.append(textNode('dt',label),textNode('dd',value));parent.append(box);}
function setGroupState(group,text,type=''){const node=groupNodes.get(group.key)?.state;if(!node)return;node.textContent=text;node.className='group-state'+(type?' '+type:'');}
function groupState(group){if(group.execution)return group.execution.message||'Current step: '+group.execution.stage;return group.issues.length?group.issues.join('\n'):group.plan||'Ready for review.';}
function renderGroup(group,index){
  const card=document.createElement('article');card.className='product-card';card.dataset.groupKey=group.key;
  const head=document.createElement('div');head.className='product-head';
  const check=document.createElement('input');check.type='checkbox';check.className='product-choice';check.checked=group.included!==false;check.setAttribute('aria-label','Include product '+group.name);check.onchange=()=>{group.included=check.checked;refreshActions();};
  const main=document.createElement('div');main.className='product-head-main';main.append(textNode('div',(index+1)+'. '+group.name,'product-title'),textNode('p','Product key: '+group.key+' · '+group.sourceRows.join(', '),'meta'));
  const tag=textNode('span',group.action==='NEW'?'New product':'Update existing','tag');main.append(tag);if(group.record){main.append(textNode('span',group.record.status==='ACTIVE'?'Currently published':'Current status: '+group.record.status,'tag'),textNode('p','Matched: '+group.record.name+' · '+(group.record.skn?'SKN '+group.record.skn+' · ':'')+'ID '+group.record.id,'meta'));const open=document.createElement('a');open.href='/admin/products/'+encodeURIComponent(group.record.id);open.textContent='Review existing product';open.target='_blank';open.rel='noopener';open.className='meta';main.append(open);}head.append(check,main);card.append(head);
  const facts=document.createElement('dl');facts.className='product-facts';fact(facts,'Product URL',group.identity.slug||group.record?.slug);fact(facts,'Category',group.category||group.record?.category?.name||(group.categoryId?'Keep current':'No category'));fact(facts,'Collections',group.collectionSlugs?.join(', ')||'Keep current on updates');fact(facts,"Ananya’s Pick",group.ananyaPick===undefined?'Keep current':group.ananyaPick?'Yes':'No');fact(facts,'Variants',group.variants.length||'Keep existing');fact(facts,'Matched photos',group.photoPlans.reduce((sum,plan)=>sum+plan.items.length,0));card.append(facts);
  if(group.issues.length){const list=document.createElement('ul');list.className='issues';for(const issue of group.issues)list.append(textNode('li',issue));card.append(list);}
  if(group.warnings.length){const list=document.createElement('ul');list.className='issues warnings';for(const warning of group.warnings)list.append(textNode('li',warning));card.append(list);}
  const details=document.createElement('details');details.append(textNode('summary','Product details and variant mapping'));
  for(const [key,label]of [['shortDescription','Short description'],['description','Description'],['fabric','Fabric'],['care','Wash care'],['includes','Includes'],['fit','Fit'],['lining','Lining'],['model','Model']]){const value=group.fields[key]??group.record?.[key];if(value){details.append(textNode('strong',label),textNode('p',value,'detail-text'));}}
  const variants=document.createElement('div');variants.className='variant-list';
  for(const row of group.variants){const current=currentVariant(group,row),line=document.createElement('div');line.className='variant';const identity=document.createElement('div');identity.append(textNode('strong',row.color+' / '+row.size),textNode('small',row.colorHex||current?.colorHex||''));const prices=document.createElement('div');prices.append(textNode('strong',money(row.supplied.pricePaise??current?.pricePaise)),textNode('small','MRP '+money(row.supplied.mrpPaise??current?.mrpPaise)));const metadata=document.createElement('div');const plan=group.photoPlans.find(item=>canonical(item.color)===canonical(row.color));metadata.append(textNode('span',plan?'Image SKU: '+plan.imageSku:'Photos: keep existing'),textNode('small',row.supplied.active===false?'Inactive size':row.supplied.active===true?'Active size':'Active choice: keep current / new active'));const measures=Object.entries(row.supplied).filter(([key])=>!['pricePaise','mrpPaise','active'].includes(key)).map(([key,value])=>key.replace(/([a-z])([A-Z])/g,'$1 $2')+': '+value);if(measures.length)metadata.append(textNode('small',measures.join(' · ')));line.append(identity,prices,metadata);variants.append(line);}details.append(variants);card.append(details);
  if(group.photoPlans.length){card.append(textNode('p','Photo match preview · each colour’s photos apply to all its size variants.','hint'));for(const plan of group.photoPlans){card.append(textNode('strong',plan.color+' · '+plan.imageSku));const gallery=document.createElement('div');gallery.className='photos';for(const item of plan.items){const figure=document.createElement('figure');figure.className='photo';const url=previewUrl(item.file);if(url){const image=document.createElement('img');image.src=url;image.alt=item.alt;image.loading='lazy';image.decoding='async';figure.append(image);}const caption=document.createElement('figcaption');caption.append(textNode('strong',item.isMain?'Main photo':'Photo '+item.sequence),document.createElement('br'),document.createTextNode(item.file.packagePath||item.name));figure.append(caption);gallery.append(figure);}card.append(gallery);}}
  const state=textNode('p',groupState(group),'group-state'+(group.issues.length?' error':''));state.setAttribute('role','status');state.setAttribute('aria-live','polite');card.append(state);groupNodes.set(group.key,{card,check,state});return card;
}
function refreshActions(){
  const pending=selected(),count=preview?.groups.length||0,done=completed().length;
  $('preview').disabled=busy||!ready||!($('package-file').files.length||$('product-file').files.length)||Boolean(writeIntent);
  $('select-all').disabled=busy||!ready||Boolean(writeIntent)||!preview;$('select-none').disabled=$('select-all').disabled;
  for(const group of preview?.groups||[]){const node=groupNodes.get(group.key);if(node){node.check.checked=group.included!==false;node.check.disabled=busy||!ready||Boolean(writeIntent)||complete(group);}}
  const draftPublication=savedDrafts(),canWrite=Boolean(ready&&!busy&&preview?.passed&&pending.length);
  $('save-draft').disabled=!canWrite||(writeIntent&&writeIntent!=='draft');$('publish').disabled=!(ready&&!busy&&preview?.passed&&(draftPublication.length||canWrite&&(!writeIntent||writeIntent==='publish')));
  $('save-draft').textContent=writeIntent==='draft'?'Resume remaining drafts':'Save as draft';$('publish').textContent=draftPublication.length?'Publish saved drafts to storefront':writeIntent==='publish'?'Resume remaining publishes':'Publish to storefront';
  $('download-report').disabled=busy||!report;$('reset-batch').disabled=busy;
  const excluded=preview?.groups.filter(group=>group.included===false&&!complete(group)).length||0;
  $('summary').textContent=count+' products · '+pending.length+' selected and pending · '+done+' completed'+(excluded?' · '+excluded+' unselected':'')+' · '+(preview?.files.length||0)+' selected photos';
  $('update-warning').hidden=!pending.some(group=>group.record?.status==='ACTIVE');
}
function renderPreview(){releasePhotos();groupNodes.clear();$('product-groups').replaceChildren(...preview.groups.map(renderGroup));notices('batch-errors',preview.errors);notices('batch-warnings',preview.warnings);$('review').hidden=false;$('finish').hidden=false;refreshActions();}
function invalidate(){if(writeIntent)return;preview=null;report=null;releasePhotos();groupNodes.clear();$('review').hidden=true;$('finish').hidden=true;$('product-groups').replaceChildren();$('report-box').hidden=true;$('progress-box').hidden=true;refreshActions();if(ready)message('Your selection changed. Review the batch before saving.');}
function clearPackage(){$('package-file').value='';$('package-summary').textContent='No ZIP package selected.';}
function fileSelection(){clearPackage();invalidate();const file=$('product-file').files[0];$('file-summary').textContent=file?file.name+' · '+(file.size/1024/1024).toFixed(2)+' MB':'No product file selected.';refreshActions();}
function photoSelection(input,other){if(writeIntent||busy)return;clearPackage();photos=Array.from(input.files||[]);other.value='';invalidate();$('photo-summary').textContent=photos.length?photos.length+' photos selected · '+(photos.reduce((sum,file)=>sum+file.size,0)/1024/1024).toFixed(1)+' MB total':'No photos selected.';if(photos.length>MAX_FILES)message('Choose at most '+MAX_FILES+' photos before reviewing.','error');refreshActions();}
$('package-file').addEventListener('change',()=>{
  if(writeIntent||busy)return;photos=[];$('product-file').value='';$('photo-files').value='';$('photo-folder').value='';$('file-summary').textContent='No product file selected.';$('photo-summary').textContent='Photos will be read from your ZIP.';invalidate();
  const file=$('package-file').files[0];$('package-summary').textContent=file?file.name+' · '+(file.size/1024/1024).toFixed(1)+' MB · details and photos together':'No ZIP package selected.';refreshActions();
});
$('product-file').addEventListener('change',fileSelection);
$('auth-check').addEventListener('click',async()=>{if(busy)return;lock(true);message('Checking your staff access…');try{const options=await api('/api/admin/products/options');if(!Array.isArray(options.categories)||!Array.isArray(options.collections))throw new Error('Product options are unavailable. Try again after signing in.');ready=true;$('auth').hidden=true;$('upload-flow').hidden=false;message('Staff access confirmed. Review the current batch or resume its remaining products. No products have been saved by this check.','success');}catch(error){if(![401,403].includes(error.status))message(error.message,'error');}finally{lock(false);}});
$('photo-files').addEventListener('change',()=>photoSelection($('photo-files'),$('photo-folder')));
$('photo-folder').addEventListener('change',()=>photoSelection($('photo-folder'),$('photo-files')));
$('preview').addEventListener('click',()=>task(async()=>{
  if(writeIntent)throw new Error('Finish or reset this saved batch before selecting another file.');
  message('Reading your product file and matching the photos. Nothing is being saved.');
  let parsed,packageWarnings=[];
  if($('package-file').files.length){
    const batch=await readProductPackage($('package-file').files[0],event=>message('Opening package locally · '+event.completed+' of '+event.total+' files'+(event.path?' · '+event.path:'')));
    parsed=parseProducts(await readWorkbook(batch.workbook));const matched=matchPackagePhotos(parsed,batch.photos);photos=matched.files;packageWarnings=matched.warnings;
    $('file-summary').textContent=batch.workbook.name+' · read from package';$('photo-summary').textContent=photos.length+' photos · read from package';
  }else parsed=parseProducts(await readWorkbook($('product-file').files[0]));
  const candidate=await previewBatch(parsed.groups,photos,api);candidate.warnings=[...parsed.warnings,...packageWarnings,...candidate.warnings];candidate.groups.forEach(group=>group.included=true);preview=candidate;report=null;renderPreview();message(candidate.passed?'Review ready. Check each product and its photos, then choose Save as draft or Publish to storefront.':'Review ready, with issues to fix. Correct the template or photo selection and review again. Nothing has been saved.',candidate.passed?'success':'error');
}));
$('select-all').addEventListener('click',()=>{if(!busy&&!writeIntent){for(const group of preview?.groups||[])if(!complete(group))group.included=true;refreshActions();}});
$('select-none').addEventListener('click',()=>{if(!busy&&!writeIntent){for(const group of preview?.groups||[])group.included=false;refreshActions();}});
$('stop').addEventListener('click',()=>{stopRequested=true;$('stop').disabled=true;message('Pausing after the current product finishes. Keep this page open to resume.');});
function progress(event){
  $('progress-box').hidden=false;$('progress').max=event.total||1;$('progress').value=event.result?event.index:Math.max(0,event.index-1);
  $('progress-message').textContent='Product '+event.index+' of '+event.total+' · '+event.name+' · '+event.message;
  const group=preview.groups.find(item=>item.key===event.groupKey);if(group)setGroupState(group,event.message,event.result?.state==='failed'?'error':event.result?'success':'');
}
function renderReport(){
  $('report-box').hidden=false;$('write-warning').hidden=false;$('report-summary').textContent=(report.published||0)+' published · '+(report.drafted||0)+' saved as draft · '+(report.failed||0)+' failed'+(report.stopped?' · paused':'');
  $('report-rows').replaceChildren(...report.results.map(result=>{const node=document.createElement('div');node.className='report-row'+(result.state==='failed'?' error':' success');node.dataset.resultState=result.state;node.append(textNode('strong',result.name+' · '+result.state),textNode('span',result.message));if(result.productId){const paragraph=document.createElement('p'),link=document.createElement('a');link.href='/admin/products/'+encodeURIComponent(result.productId);link.textContent='Open saved product';link.target='_blank';link.rel='noopener';paragraph.append(link);node.append(paragraph);}return node;}));
  $('write-warning').textContent=!report.results.length?'No product result has been confirmed. Review the error before resuming, or start another batch.':selected().length?'Some products have been processed. Keep this page open to resume the remaining products. Completed products are excluded from repeat actions; unconfirmed results need review before any retry.':savedDrafts().length?'Your selected drafts are saved. You can publish these saved drafts now, download the results, or return later through Products. Unselected products have not been saved.':'Your selected products are complete. Unselected products have not been saved. Download your results, open the saved products, or start another batch.';
}
function mergeReport(next){
  const results=new Map((report?.results||[]).map(result=>[result.key,result]));for(const result of next.results)results.set(result.key,result);
  const combined={intent:next.intent,results:[...results.values()],stopped:next.stopped,published:0,drafted:0,failed:0};for(const result of combined.results){if(result.state==='published')combined.published++;else if(result.state==='draft')combined.drafted++;else if(result.state==='failed')combined.failed++;}return combined;
}
async function save(intent){
  if(busy||!ready)return;
  const draftPublication=intent==='publish'?savedDrafts():[],groups=draftPublication.length?draftPublication:selected();if(!preview?.passed||preview.errors.length)return message('Fix every preview issue before saving. Nothing has been saved.','error');if(!groups.length)return message('Select at least one pending product.','error');if(writeIntent&&writeIntent!==intent&&!draftPublication.length)return message('Resume this batch with its original action.','error');
  const published=groups.filter(group=>group.record?.status==='ACTIVE');
  const confirmation=(intent==='publish'?'Publish '+groups.length+' selected products to your storefront after their details and photos are confirmed?':'Save '+groups.length+' selected products as draft, hidden from your storefront?')+(published.length?'\n\n'+published.length+' currently published products will move to draft before editing. They will be temporarily removed from the storefront.'+(intent==='draft'?' They stay hidden until you publish them.':' Completed products will be published again after verification.'):'');
  if(!window.confirm(confirmation))return;
  writeIntent=intent;stopRequested=false;
  await task(async()=>{message(intent==='publish'?'Saving product details and photos, then publishing each confirmed product.':'Saving product drafts and their photos.');let next;try{next=await runBatch({...preview,groups},{intent,api,onProgress:progress,shouldStop:()=>stopRequested});}catch(error){report=mergeReport({intent,results:[],stopped:true});renderReport();throw error;}report=mergeReport(next);renderReport();for(const group of preview.groups)if(group.execution?.state==='failed'&&[401,403].includes(group.execution.status))authFailure();if(ready)message(next.stopped?'Batch paused. Download the results or resume the remaining products on this page.':report.failed?'Some products need attention. Review their results before resuming. Completed products will not be repeated.':'Completed. '+report.drafted+' drafts saved and '+report.published+' products published.',report.failed?'error':'success');});
}
$('save-draft').addEventListener('click',()=>save('draft'));
$('publish').addEventListener('click',()=>save('publish'));
$('download-report').addEventListener('click',()=>{if(!report||busy)return;const url=URL.createObjectURL(new Blob([reportCsv(report)],{type:'text/csv;charset=utf-8'}));const link=document.createElement('a');link.href=url;link.download='HIDI_Product_Upload_Results.csv';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});
$('reset-batch').addEventListener('click',()=>{
  if(busy)return;if(writeIntent&&selected().length&&!window.confirm('Start another batch? The current page will no longer resume the remaining products. Download the results first so you can review any incomplete drafts. Saved products are retained.'))return;
  releasePhotos();photos=[];preview=null;report=null;writeIntent=null;stopRequested=false;groupNodes.clear();clearPackage();$('product-file').value='';$('photo-files').value='';$('photo-folder').value='';$('file-summary').textContent='No product file selected.';$('photo-summary').textContent='No photos selected.';$('product-groups').replaceChildren();$('report-rows').replaceChildren();$('review').hidden=true;$('finish').hidden=true;$('report-box').hidden=true;$('write-warning').hidden=true;$('progress-box').hidden=true;$('write-warning').textContent='Some products have been processed. Keep this page open to resume the remaining products. Completed products are excluded from repeat actions; unconfirmed results need review before any retry.';lock(false);message('Ready for another ZIP package or product file and its photos.');
});
window.addEventListener('beforeunload',event=>{if(busy||preview&&selected().length||!preview&&($('package-file').files.length||$('product-file').files.length)){event.preventDefault();event.returnValue='';}});
window.addEventListener('pagehide',releasePhotos);
void (async()=>{try{const options=await api('/api/admin/products/options');if(!Array.isArray(options.categories)||!Array.isArray(options.collections))throw new Error('Product options are unavailable. Reload this page to try again.');ready=true;$('upload-flow').hidden=false;lock(false);message('Ready. Choose one ZIP package with your product details and photos, then review.');}catch(error){if(![401,403].includes(error.status)){$('load-error').hidden=false;$('load-error').textContent=error.message;message('Unable to load product options. Reload this page to try again.','error');}}})();
