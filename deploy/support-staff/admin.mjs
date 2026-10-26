const $ = id => document.getElementById(id);
const primary = 'fashionshidi@gmail.com';
let actor, currentOrder, events = [], busy = false;
const label = value => String(value ?? '').replaceAll('_',' ');
const time = value => new Date(value).toLocaleString('en-IN',{timeZone:'Asia/Kolkata'});
function element(tag, text, className) { const node = document.createElement(tag); if(text != null)node.textContent=text; if(className)node.className=className; return node; }
function message(text) { $('message').textContent = text; $('error').hidden = true; }
function error(caught) { $('error').textContent = caught instanceof Error ? caught.message : String(caught); $('error').hidden=false; }
async function api(path, method='GET', body) {
  const response = await fetch(path,{method,cache:'no-store',headers:body ? {'content-type':'application/json'} : {},...(body ? {body:JSON.stringify(body)} : {})});
  const data = await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(data.message || 'Unable to complete this action. Please retry.');
  return data;
}
setInterval(()=>{if(actor)void api('/api/admin/session','PUT').catch(()=>error(new Error('Your session expired. Use Staff sign in to continue.')));},40*60*1000);
async function action(work) {
  if(busy)return;busy=true;document.querySelectorAll('button').forEach(button=>button.disabled=true);$('error').hidden=true;
  try { await work(); } catch(caught) { error(caught); }
  finally { busy=false;document.querySelectorAll('button').forEach(button=>button.disabled=false); }
}
function supportPath() {return `/api/admin/orders/${encodeURIComponent(currentOrder)}/support`;}
function renderHistory() {
  $('history').replaceChildren();
  const tags=events.filter(event=>event.kind==='TAGS').at(-1)?.tags || [];
  $('tags-summary').textContent='Issue tags: '+(tags.join(', ') || 'None');
  $('tags').value=tags.join(', ');
  const follow=events.filter(event=>event.kind==='FOLLOW_UP').at(-1);
  $('followup-summary').textContent=follow ? `Follow-up: ${label(follow.status)}${follow.dueAt ? ' · '+time(follow.dueAt) : ''} · ${follow.text}` : 'No follow-up recorded.';
  if(!events.length)$('history').append(element('p','No support updates yet.'));
  for(const event of [...events].reverse()) {
    const row=element('article',null,'entry');row.append(element('strong',label(event.kind)+(event.type?' · '+label(event.type):'')));
    if(event.text)row.append(element('p',event.text));
    if(event.tags)row.append(element('p',event.tags.join(', ')||'Tags cleared'));
    if(event.status)row.append(element('p',label(event.status)+(event.dueAt?' · '+time(event.dueAt):'')));
    if(event.amountPaise!=null)row.append(element('p','₹'+(event.amountPaise/100).toFixed(2)));
    row.append(element('small',`${event.actorName} · ${time(event.createdAt)}`));
    if(event.decision)row.append(element('strong',event.decision,'decision'));
    if(event.kind==='APPROVAL_REQUEST') {
      const decision=events.find(value=>value.kind==='APPROVAL_DECISION'&&value.requestId===event.id);
      row.append(element('strong',decision?.decision || 'PENDING OWNER APPROVAL','badge'));
      if(!decision&&actor.role==='OWNER') {
        const form=element('form'), reason=element('textarea'); reason.id='reason-'+event.id;reason.required=true;reason.maxLength=2000;
        const caption=element('label','Decision reason');caption.htmlFor=reason.id;form.append(caption,reason);
        for(const decision of ['APPROVED','REJECTED']) { const button=element('button',decision==='APPROVED'?'Approve':'Reject');button.type='button';button.addEventListener('click',()=>{if(!form.reportValidity())return;void action(async()=>{await api(`${supportPath()}/${encodeURIComponent(event.id)}/decision`,'POST',{decision,text:reason.value});await loadOrder();await loadQueue();message('Owner decision recorded. Approved actions must be carried out separately.');});});form.append(button); }
        form.addEventListener('submit',event=>event.preventDefault());row.append(form);
      }
    }
    $('history').append(row);
  }
}
async function loadOrder() {
  const result=await api(supportPath());events=result.events || [];renderHistory();$('case').hidden=false;$('case-title').textContent=currentOrder+' · Support';$('order-link').href='/admin/orders/'+encodeURIComponent(currentOrder);
}
async function loadQueue() {
  const result=await api('/api/admin/support');$('queue').replaceChildren();
  if(!result.items?.length)$('queue').append(element('p','No open follow-ups or pending approvals.'));
  for(const item of result.items || []) {
    const row=element('article',null,'entry'),link=element('a',item.orderNumber);link.href='/admin/support?order='+encodeURIComponent(item.orderNumber);
    link.addEventListener('click',event=>{event.preventDefault();currentOrder=item.orderNumber;$('order-number').value=currentOrder;void action(async()=>{await loadOrder();$('case').scrollIntoView({behavior:'smooth'});});});
    row.append(link,element('strong',item.kind==='APPROVAL_REQUEST'?'Pending Owner approval · '+label(item.type):'Follow-up · '+label(item.status)),element('p',item.text));
    if(item.dueAt)row.append(element('small',(Date.parse(item.dueAt)<Date.now()?'Overdue: ':'Due: ')+time(item.dueAt)));
    $('queue').append(row);
  }
}
function fields() {
  const kind=$('kind').value;
  $('details-field').hidden=kind==='TAGS';$('details').required=kind!=='TAGS';
  $('tags-field').hidden=kind!=='TAGS';$('followup-field').hidden=kind!=='FOLLOW_UP';$('approval-field').hidden=kind!=='APPROVAL_REQUEST';
  $('due').required=kind==='FOLLOW_UP'&&$('followup-status').value!=='DONE';
  $('save-update').textContent=kind==='APPROVAL_REQUEST'?'Submit for Owner approval':'Save support update';
}
$('kind').addEventListener('change',fields);$('followup-status').addEventListener('change',fields);
$('open-order').addEventListener('submit',event=>{event.preventDefault();currentOrder=$('order-number').value.trim();void action(async()=>{await loadOrder();message('Support history loaded.');});});
$('refresh').addEventListener('click',()=>void action(async()=>{await loadQueue();message('Queue refreshed.');}));
$('update').addEventListener('submit',event=>{
  event.preventDefault();const kind=$('kind').value, payload={kind,text:$('details').value};
  if(kind==='TAGS')payload.tags=$('tags').value.split(',').map(value=>value.trim()).filter(Boolean);
  if(kind==='FOLLOW_UP'){payload.status=$('followup-status').value;payload.dueAt=$('due').value?new Date($('due').value).toISOString():null;}
  if(kind==='APPROVAL_REQUEST'){payload.type=$('approval-type').value;if($('amount').value)payload.amountPaise=Math.round(Number($('amount').value)*100);}
  void action(async()=>{await api(supportPath(),'POST',payload);$('details').value='';$('amount').value='';await loadOrder();await loadQueue();message('Support update saved.');});
});
async function loadStaff() {
  const {staff=[]}=await api('/api/admin/staff');$('staff-list').replaceChildren();
  for(const member of staff) {
    const row=element('article',null,'entry'),protectedOwner=member.email.toLowerCase()===primary;
    row.append(element('strong',member.displayName),element('p',member.email),element('small',`${protectedOwner?'Super admin / primary Owner':(member.roles ?? [member.role]).map(label).join(' + ')} · ${member.active?'Active':'Disabled'} · Last sign-in: ${member.lastLoginAt?time(member.lastLoginAt):'Never'}`));
    if(!protectedOwner&&member.id!==actor.id){
      const select=rolePicker(member.roles ?? [member.role], 'Roles for '+member.email);
      const save=element('button','Save roles');save.addEventListener('click',()=>void action(async()=>{await api('/api/admin/staff/'+encodeURIComponent(member.id),'PATCH',{roles:selectedRoles(select)});await loadStaff();message('Staff roles updated.');}));
      const active=element('button',member.active?'Disable access':'Restore access');active.addEventListener('click',()=>void action(async()=>{await api('/api/admin/staff/'+encodeURIComponent(member.id),'PATCH',{active:!member.active});await loadStaff();message('Staff access updated.');}));
      row.append(select,save,active);
    }
    $('staff-list').append(row);
  }
}
function rolePicker(selected, title) {
  const group=element('fieldset',null,'role-picker');group.append(element('legend',title),element('small','Choose 1–3 roles. Permissions from the selected roles are combined. Owner grants full access, including staff management and approvals.'));
  for(const role of ['SUPPORT','OPERATIONS','CATALOG','OWNER']) {
    const caption=element('label'),input=element('input');input.type='checkbox';input.value=role;input.checked=selected.includes(role);input.defaultChecked=input.checked;
    caption.append(input,document.createTextNode(label(role)));group.append(caption);
  }
  group.addEventListener('change',()=>{const count=group.querySelectorAll('input:checked').length;for(const input of group.querySelectorAll('input'))input.disabled=!input.checked&&count>=3;});
  return group;
}
function selectedRoles(group) {const roles=[...group.querySelectorAll('input:checked')].map(input=>input.value);if(roles.length<1||roles.length>3)throw new Error('Choose between one and three roles.');return roles;}
$('staff-role').replaceWith(Object.assign(rolePicker(['SUPPORT'],'Roles'),{id:'staff-role'}));
$('create-staff').addEventListener('submit',event=>{event.preventDefault();void action(async()=>{await api('/api/admin/staff','POST',{displayName:$('staff-name').value,email:$('staff-email').value,roles:selectedRoles($('staff-role'))});$('create-staff').reset();$('staff-role').dispatchEvent(new Event('change'));await loadStaff();message('User ID created. The staff member can sign in with their email and a verification code.');});});
$('sign-out').addEventListener('click',()=>void action(async()=>{await api('/api/admin/session','DELETE');location.href='/admin/sign-in';}));
try {
  const session=await api('/api/admin/session');actor=session.admin;if(!actor)throw new Error('Staff sign-in required');
  $('identity').textContent=actor.displayName+' · '+(actor.email?.toLowerCase()===primary?'Super admin / Owner':(actor.roles ?? [actor.role]).map(label).join(' + '));$('team-link').hidden=actor.role!=='OWNER';
  if(location.pathname==='/admin/staff') {
    if(actor.role!=='OWNER')throw new Error('Only the Owner can create admin users');
    $('title').textContent='Team & access';$('intro').textContent='Create individual admin user IDs and control their roles.';$('staff-view').hidden=false;await loadStaff();message('Owner access verified.');
  } else {
    if(!['OWNER','OPERATIONS','SUPPORT'].includes(actor.role))throw new Error('Your role cannot access support');
    $('support-view').hidden=false;await loadQueue();currentOrder=new URLSearchParams(location.search).get('order');if(currentOrder){$('order-number').value=currentOrder;await loadOrder();}message('Staff access verified.');
  }
}catch(caught){error(caught);$('message').textContent='Sign in with an authorized staff account.';}
