import { fonts, presets, roles, sizeDevices, sizeLimits, emptySizes } from './registry.mjs';
const root=document.getElementById('hidi-type-studio'), q=s=>root.querySelector(s), all=s=>[...root.querySelectorAll(s)];
let state, scope='storefront', view='draft', draft, dirty=false, busy=false, conflict=false, sizeDevice='desktop';
const sizeLabels={heading:'Page titles',body:'Body text',product:'Product names',ui:'Buttons & navigation'};
for(const role of roles){const label=document.createElement('span');label.textContent=sizeLabels[role];const limits=document.createElement('small');limits.className='ht-muted';limits.style.display='block';limits.textContent=sizeLimits[role].join('–')+' px';label.append(limits);q('#ht-size-grid').append(label);
  for(const device of sizeDevices){const input=document.createElement('input');input.type='number';input.min=sizeLimits[role][0];input.max=sizeLimits[role][1];input.step='1';input.placeholder='Auto';input.id='ht-size-'+device+'-'+role;input.dataset.sizeRole=role;input.dataset.sizeDevice=device;input.setAttribute('aria-label',sizeLabels[role]+' size on '+device);input.title=sizeLimits[role].join('–')+' px, or blank';q('#ht-size-grid').append(input);}}
function invalidSizes(){return all('[data-size-role]').some(input=>!input.validity.valid);}
function message(text,error=false){q('#ht-status').textContent=text;q('#ht-status').dataset.error=String(error);}
function render(){
  q('#ht-controls').disabled=!state||busy||conflict;
  q('#ht-save').disabled=!state||busy||!dirty||conflict||invalidSizes();
  q('#ht-publish').disabled=!state||busy||dirty||conflict;
  q('#ht-rollback').disabled=!state||busy||dirty||conflict||!state.profiles[scope].previous;
  q('#ht-reload').disabled=busy;
  for(const b of all('[data-profile]')){b.disabled=busy;b.setAttribute('aria-pressed',String(b.dataset.profile===scope));}
  for(const b of all('[data-view]'))b.setAttribute('aria-pressed',String(b.dataset.view===view));
  if(!state)return;
  const shown=view==='draft'?draft:(state.profiles[scope].published||presets.classic);
  for(const role of roles){q('#ht-'+role).value=draft[role];q('#ht-sample').style.setProperty('--ht-'+role+'-font',fonts[shown[role]].stack);}
  for(const input of all('[data-size-role]')){if(document.activeElement!==input)input.value=draft.sizes?.[input.dataset.sizeDevice]?.[input.dataset.sizeRole]??'';input.setAttribute('aria-invalid',String(!input.validity.valid));}
  for(const role of roles){const n=shown.sizes?.[sizeDevice]?.[role];if(Number.isInteger(n))q('#ht-sample').style.setProperty('--ht-'+role+'-size',n+'px');else q('#ht-sample').style.removeProperty('--ht-'+role+'-size');}
  q('#ht-sample').dataset.sizeDevice=sizeDevice;
  for(const b of all('[data-size-device]:not(input)'))b.setAttribute('aria-pressed',String(b.dataset.sizeDevice===sizeDevice));
  q('#ht-preset').value=Object.keys(presets).find(key=>roles.every(role=>presets[key][role]===draft[role]))||'custom';
  q('#ht-store').hidden=scope!=='storefront';q('#ht-admin').hidden=scope!=='admin';
  q('#ht-preview-label').textContent=(scope==='storefront'?'Storefront':'Admin interface')+' preview';
  q('#ht-revision').textContent='Published v'+state.revision;
  q('#ht-pairing').textContent=view==='published'&&!state.profiles[scope].published?'Original site typography (no override)':roles.map(role=>fonts[shown[role]].name).join(' / ');
  q('#ht-history').replaceChildren(...state.history.filter(h=>h.profile===scope).map(h=>{const li=document.createElement('li');li.textContent=`Version ${h.version} · ${h.action==='rollback'?'Restored':'Published'} by ${h.publishedBy.displayName} · ${new Date(h.publishedAt).toLocaleString()}`;return li;}));
  q('#ht-save').disabled=!state||busy||!dirty||conflict||invalidSizes();
}
for(const select of all('[data-font-role]'))for(const [id,font] of Object.entries(fonts)){const option=document.createElement('option');option.value=id;option.textContent=font.name;select.append(option);}
async function request(body){const response=await fetch('/api/hidi/typography/admin',{credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(15000),...(body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{})});const data=await response.json();if(!response.ok)throw Object.assign(new Error(data.message||'Unable to save typography.'),{status:response.status});return data;}
function accept(next){state=next;draft=structuredClone(state.profiles[scope].draft);dirty=false;conflict=false;}
async function reload(){if(busy||dirty&&!confirm('Discard your unsaved font changes and reload?'))return;busy=true;render();try{accept(await request());message('Choose fonts, save your draft, then publish when ready.');}catch(error){message(error.message,true);if(!state){const link=document.createElement('a');link.href='/admin/sign-in';link.textContent=' Sign in';q('#ht-status').append(link);}}finally{busy=false;render();}}
async function write(action){if(!state||busy||conflict||(action==='save'&&invalidSizes())||(action!=='save'&&dirty))return;busy=true;render();message(action==='save'?'Saving draft…':'Updating published fonts…');try{accept(await request({action,profile:scope,etag:state.etag,...(action==='save'?{config:draft}:{})}));if(action!=='save'){view='published';window.dispatchEvent(new Event('hidi:typography-published'));}message(action==='save'?'Draft saved. Published fonts are unchanged.':`Published version ${state.revision}. New page loads use it immediately; open pages refresh within 30 seconds or on focus.`);}catch(error){if(error.status===409)conflict=true;message(error.message+(conflict?' Your unsaved selections are retained. Reload settings to continue.':''),true);}finally{busy=false;render();}}
for(const b of all('[data-profile]'))b.addEventListener('click',()=>{if(!state||busy||b.dataset.profile===scope)return;if(dirty&&!confirm('Discard unsaved changes before switching profile?'))return;scope=b.dataset.profile;draft=structuredClone(state.profiles[scope].draft);dirty=false;render();});
for(const b of all('[data-view]'))b.addEventListener('click',()=>{view=b.dataset.view;render();});
for(const select of all('[data-font-role]'))select.addEventListener('change',()=>{draft[select.dataset.fontRole]=select.value;dirty=true;view='draft';render();message('Unsaved draft. Save before publishing.');});
q('#ht-preset').addEventListener('change',e=>{if(!presets[e.target.value])return;draft={...structuredClone(presets[e.target.value]),...(draft.sizes?{sizes:structuredClone(draft.sizes)}:{})};dirty=true;view='draft';render();message('Pairing applied to draft only. Your size settings are retained.');});
for(const input of all('[data-size-role]'))input.addEventListener('input',()=>{draft.sizes??=emptySizes();draft.sizes[input.dataset.sizeDevice][input.dataset.sizeRole]=input.value===''?null:input.valueAsNumber;dirty=true;view='draft';render();message(invalidSizes()?'Enter a whole-pixel size within the field’s limits, or leave it blank.':'Unsaved font sizes. Save your draft before publishing.',invalidSizes());});
for(const b of all('button[data-size-device]'))b.addEventListener('click',()=>{sizeDevice=b.dataset.sizeDevice;render();});
q('#ht-size-reset').addEventListener('click',()=>{draft.sizes=emptySizes();dirty=true;view='draft';render();message('Current website sizes selected in the draft. Save and publish to apply.');});
q('#ht-save').addEventListener('click',()=>write('save'));q('#ht-publish').addEventListener('click',()=>write('publish'));
q('#ht-rollback').addEventListener('click',()=>{if(confirm('Restore the previous published typography for this profile?'))write('rollback');});q('#ht-reload').addEventListener('click',reload);
window.addEventListener('beforeunload',event=>{if(dirty){event.preventDefault();event.returnValue='';}});
render();reload();
