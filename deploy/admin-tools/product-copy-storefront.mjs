import {renderProductCopy,narrativeCopy,escapeCopy} from './product-copy.mjs';
import {reviewedPortraitPhoto} from './product-photo-framing.mjs';
let queued=false,slug='',product=null,loading='',failed='';
const cache=new Map();
function copy(source,key,text,label=''){
 if(!source)return;
 source.dataset.hidiCopySource=key;
 let panel=source.parentElement.querySelector('[data-hidi-copy="'+key+'"]');
 if(!panel){panel=document.createElement(source.tagName==='DD'?'dd':'div');panel.dataset.hidiCopy=key;panel.className='hidi-formatted-copy '+source.className;source.after(panel);}
 const value=String(text??''),cacheKey=label+'\n'+value;if(panel.dataset.copyText!==cacheKey){panel.innerHTML=(label?'<p class="hidi-copy-label"><strong>'+escapeCopy(label)+'</strong></p>':'')+renderProductCopy(value);panel.dataset.copyText=cacheKey;}
}
function adminLinks(){
 if(!location.pathname.startsWith('/admin'))return;
 for(const link of document.querySelectorAll('a[href^="/admin/products/"]')){
  const match=link.getAttribute('href').match(/^\/admin\/products\/([a-zA-Z0-9_-]{1,64})$/);if(!match||['new','price-tags','bulk-import'].includes(match[1]))continue;
  const row=link.closest('tr');if(!row||row.querySelector('[data-hidi-preview-link]'))continue;
  const a=document.createElement('a');a.dataset.hidiPreviewLink='true';a.href='/admin/product-preview?product='+encodeURIComponent(match[1]);a.textContent='Preview & edit text';row.lastElementChild?.append(a);
 }
 const match=location.pathname.match(/^\/admin\/products\/([a-zA-Z0-9_-]{1,64})\/?$/),heading=document.querySelector('main h1');
 if(match&&!['new','price-tags','bulk-import'].includes(match[1])&&heading&&!document.querySelector('[data-hidi-preview-editor]')){const a=document.createElement('a');a.dataset.hidiPreviewEditor='true';a.href='/admin/product-preview?product='+encodeURIComponent(match[1]);a.textContent='Preview & edit formatted text';heading.after(a);}
}
function apply(){
 adminLinks();
 const next=location.pathname.match(/^\/products\/([^/]+)\/?$/)?.[1]||'';
 if(next!==slug){slug=next;product=cache.get(next)||null;failed='';}
 if(!slug)return;
 const shell=document.querySelector('[data-hidi-react-pdp]');if(shell&&shell.dataset.hidiHydrated!=='true')return;
 // The tighter first-photo frame leaves the original file and inspection dialog intact.
 const first=document.querySelector('.pdp-gallery .pdp-image');if(first&&reviewedPortraitPhoto(first.querySelector('img')?.getAttribute('src'))&&!first.hasAttribute('data-hidi-portrait'))first.dataset.hidiPortrait='true';
 if(!product){if(loading!==slug&&failed!==slug){const target=slug;loading=target;void fetch('/api/store/products/'+target,{credentials:'same-origin',cache:'no-store'}).then(async r=>{if(!r.ok)throw Error('Product unavailable');const data=await r.json();cache.set(target,data);if(slug===target)product=data;}).catch(()=>{failed=target;}).finally(()=>{loading='';schedule();});}return;}
 copy(document.querySelector('.pdp-subtitle'),'short',product.shortDescription);
 copy(document.querySelector('.pdp-description'),'description',narrativeCopy(product.description));
 // Existing React-owned elements stay in place for navigation and hydration.
 const material=[...document.querySelectorAll('details')].find(d=>d.querySelector('summary')?.textContent.includes('Material & Care'));
 if(material){const content=material.querySelector('[class*="content"]');if(content){for(const p of [...content.querySelectorAll('p')]){if(p.closest('[data-hidi-copy]'))continue;const label=p.querySelector('strong')?.textContent||'';if(/^Fabric:/.test(label))copy(p,'fabric',product.fabric||'Fabric information is not published for this style yet.','Fabric:');if(/^Care:/.test(label))copy(p,'care',product.care||'Follow the care label attached to the garment.','Care:');}}}
 const text=[product.description,product.shortDescription].filter(Boolean).join('\n');
 const fact=name=>text.match(new RegExp('(?:^|\\n)\\s*'+name+'\\s*:\\s*([^\\n]+)','i'))?.[1]?.trim();
 const values={'fabric':product.fabric,'included pieces':fact('Includes'),'fit':fact('Fit'),'lining':fact('Lining'),'care':product.care,'model information':fact('Model')};
 for(const row of document.querySelectorAll('[aria-label="Product quality and fit summary"] dl>div')){const label=row.querySelector('dt')?.textContent.trim().toLowerCase(),value=values[label],dd=row.querySelector('dd');if(dd&&value)copy(dd,'glance-'+label.replace(/ /g,'-'),value);}
 const specs=[...document.querySelectorAll('details')].find(d=>d.querySelector('summary')?.textContent.includes('Specifications'));
 if(specs){for(const row of specs.querySelectorAll('p')){if(row.closest('[data-hidi-copy]'))continue;const label=row.querySelector('strong')?.textContent.trim(),name={'Included pieces:':'Includes','Fit:':'Fit','Lining:':'Lining','Model:':'Model'}[label],value=name&&fact(name);if(value)copy(row,'spec-'+name.toLowerCase(),value,label);}}
 const detail=document.querySelector('.pdp-selected-detail'),purchase=document.querySelector('.pdp-purchase');
 if(detail&&purchase&&!purchase.contains(detail)&&!detail.classList.contains('sr-only')){detail.dataset.hidiCopySelection='true';let p=purchase.querySelector('[data-hidi-selection-copy]');if(!p){p=document.createElement('p');p.dataset.hidiSelectionCopy='true';purchase.prepend(p);}const value=detail.textContent.replace(/ · Select a size below$/,'');if(p.textContent!==value)p.textContent=value;}
}
function schedule(){if(queued)return;queued=true;requestAnimationFrame(()=>{queued=false;apply();});}
new MutationObserver(schedule).observe(document.documentElement,{childList:true,subtree:true});
window.addEventListener('hidi:product-ready',schedule);window.addEventListener('popstate',schedule);window.addEventListener('pageshow',schedule);
if(document.readyState==='complete')schedule();else window.addEventListener('load',schedule,{once:true});
