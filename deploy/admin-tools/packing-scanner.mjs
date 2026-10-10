const $=id=>document.getElementById(id), normalize=v=>String(v||'').trim().toUpperCase();
let queue=[],plan=null,scans=[],expected=new Map(),actual=new Map(),finishing=false,loading=false,queueRequest=0,loadRequest=0,timer=0;
const money=value=>new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR',maximumFractionDigits:0}).format((value||0)/100);
function say(text,type=''){$('message').textContent=text;$('message').className='notice '+type;}
function customerName(order){const a=order?.shippingAddress||{};return [a.firstName,a.lastName].filter(Boolean).join(' ')||order?.customerPhone||'HIDI customer';}
function focusScan(){if(plan?.status==='CONFIRMED'&&!finishing&&!loading&&!complete())$('scan').focus();}
function complete(){return Boolean(plan&&scans.length===plan.itemCount&&[...expected].every(([code,qty])=>(actual.get(code)||0)===qty));}
async function api(path,method='GET',body){
  const response=await fetch(path,{method,cache:'no-store',credentials:'same-origin',...(body?{headers:{'content-type':'application/json'},body:JSON.stringify(body)}:{})});
  const data=await response.json().catch(()=>({}));
  if(!response.ok){if([401,403].includes(response.status))$('auth').hidden=false;throw new Error(Array.isArray(data.message)?data.message.join('. '):data.message||'Unable to complete packing request.');}
  return data;
}
function image(url){if(!url)return null;try{const parsed=new URL(url,location.origin);if(!['http:','https:'].includes(parsed.protocol))return null;}catch{return null;}const img=document.createElement('img');img.src=url;img.alt='';img.loading='lazy';img.onerror=()=>img.remove();return img;}
function renderQueue(){
  $('queue').replaceChildren();$('queueCount').textContent=queue.length+' confirmed orders · oldest shown first';$('queueLimit').hidden=queue.length<100;
  if(!queue.length)$('queue').textContent=$('query').value.trim()?'No matching confirmed orders.':'No orders are waiting for packing.';
  for(const order of queue){
    const b=document.createElement('button');b.type='button';b.className='order'+(plan?.orderNumber===order.orderNumber?' active':'');b.disabled=loading||finishing;
    const title=document.createElement('strong');title.textContent=order.orderNumber;b.append(title);
    const customer=document.createElement('span');customer.textContent=customerName(order);b.append(customer);
    const meta=document.createElement('small');const date=new Date(order.createdAt);meta.textContent=[order.itemCount+' pieces',money(order.totalPaise),Number.isFinite(date.getTime())?date.toLocaleString('en-IN'):''].filter(Boolean).join(' · ');b.append(meta);
    for(const item of order.items||[]){const text=document.createElement('small');text.textContent=item.productName+' · '+[item.color,item.size,'×'+item.quantity].filter(Boolean).join(' · ');b.append(text);}
    const thumbs=document.createElement('div');thumbs.className='thumbs';for(const item of (order.items||[]).slice(0,3)){const img=image(item.image);if(img)thumbs.append(img);}b.append(thumbs);
    b.onclick=()=>openOrder(order.orderNumber,order);$('queue').append(b);
  }
  $('next').disabled=loading||finishing||!queue.some(o=>o.orderNumber!==plan?.orderNumber);
}
async function refreshQueue(){
  const request=++queueRequest;$('refresh').disabled=true;$('queueMessage').textContent='Updating queue…';
  try{
    const q=$('query').value.trim(),data=await api('/api/admin/orders?status=CONFIRMED'+(q?'&q='+encodeURIComponent(q):''));
    if(request!==queueRequest)return;
    queue=(data.orders||[]).filter(o=>o.status==='CONFIRMED').sort((a,b)=>new Date(a.createdAt)-new Date(b.createdAt));renderQueue();$('queueMessage').textContent='';
  }catch(e){if(request===queueRequest){queue=[];renderQueue();$('queueMessage').textContent=e.message;$('queueMessage').className='hint bad';}}
  finally{if(request===queueRequest)$('refresh').disabled=false;}
}
function render(){
  if(!plan)return;
  $('orderHeading').textContent=plan.orderNumber;$('orderState').textContent=plan.status;$('workspace').hidden=false;
  $('progress').style.width=(plan.itemCount?Math.min(100,scans.length/plan.itemCount*100):0)+'%';$('summary').textContent=scans.length+' of '+plan.itemCount+' pieces verified';
  $('scan').disabled=plan.status!=='CONFIRMED'||finishing||loading||complete();$('undo').disabled=!scans.length||finishing||plan.status!=='CONFIRMED';$('items').replaceChildren();
  const remaining=new Map(actual);
  for(const item of plan.items){
    const row=document.createElement('div');row.className='item';const img=image(item.image);if(img)row.append(img);
    const text=document.createElement('div');text.className='details';const name=document.createElement('strong');name.textContent=item.productName;const meta=document.createElement('div');meta.className='meta';meta.textContent=[item.size,item.color,item.sku].filter(Boolean).join(' · ');text.append(name,meta);row.append(text);
    const qty=Math.min(item.quantity,remaining.get(item.barcode)||0);remaining.set(item.barcode,(remaining.get(item.barcode)||0)-qty);const count=document.createElement('span');count.className='count'+(qty===item.quantity?' good':'');count.textContent=qty+' / '+item.quantity;row.append(count);$('items').append(row);
  }
  $('done').hidden=plan.status!=='PACKED';$('scanPanel').hidden=plan.status==='PACKED';$('details').href='/admin/orders/'+encodeURIComponent(plan.orderNumber);renderQueue();
}
async function openOrder(raw,detail){
  if(loading||finishing)return;const order=normalize(raw);if(!/^[A-Z0-9_-]{1,80}$/.test(order)){say('Choose an order or enter a valid order number.','bad');return;}
  if(scans.length&&plan?.status==='CONFIRMED'&&!window.confirm('Switch orders? The scans for this order will be cleared.'))return;
  const request=++loadRequest;loading=true;plan=null;scans=[];expected=new Map();actual=new Map();clearTimeout(timer);$('scan').value='';$('scan').disabled=true;$('workspace').hidden=true;$('customer').hidden=true;$('retry').hidden=true;$('load').disabled=true;$('orderNo').value=order;renderQueue();say('Opening '+order+'…');
  try{
    const data=await api('/api/hidi/packing-plan?order='+encodeURIComponent(order));if(request!==loadRequest)return;
    if(!data.order?.items?.length||data.order.itemCount<1)throw new Error('This order has no packable pieces.');
    plan=data.order;for(const item of plan.items)expected.set(item.barcode,(expected.get(item.barcode)||0)+item.quantity);
    detail??=queue.find(o=>o.orderNumber===order);
    if(!detail)detail=(await api('/api/admin/orders/'+encodeURIComponent(order))).order;
    const a=detail?.shippingAddress||{};$('customer').textContent=[customerName(detail||plan),detail?.customerPhone||plan.customerPhone,[a.city,a.state,a.postalCode].filter(Boolean).join(', '),plan.itemCount+' pieces',money(plan.totalPaise)].filter(Boolean).join(' · ');$('customer').hidden=false;
    say(plan.status==='CONFIRMED'?'Order ready. Check the garments below and start scanning.':plan.status==='PACKED'?'This order is already packed.':'This order is '+plan.status+'. Only confirmed orders can be packed.',plan.status==='CONFIRMED'||plan.status==='PACKED'?'good':'bad');
  }catch(e){plan=null;$('orderHeading').textContent='Unable to open '+order;$('orderState').textContent='No order loaded';say(e.message,'bad');}
  finally{loading=false;$('load').disabled=false;if(plan){render();focusScan();}else renderQueue();}
}
async function finish(){
  if(finishing||loading||!plan||plan.status!=='CONFIRMED'||!complete())return;finishing=true;$('retry').hidden=true;render();say('All pieces matched. Saving packed status…');
  try{
    const data=await api('/api/hidi/packing-complete?order='+encodeURIComponent(plan.orderNumber),'POST',{scannedBarcodes:scans});
    if(!data.packed||data.status!=='PACKED')throw new Error('Packed status could not be confirmed. Retry to check the saved status.');
    plan.status='PACKED';queue=queue.filter(o=>o.orderNumber!==plan.orderNumber);say('Packed successfully: '+plan.orderNumber+'. Open the next order when its garments are ready.','good');
  }catch(e){$('retry').hidden=false;say(e.message+' Your scans are retained; use Retry packing.','bad');}
  finally{finishing=false;render();if(plan.status==='PACKED')void refreshQueue();}
}
function acceptScan(raw){
  if(!plan||plan.status!=='CONFIRMED'||finishing||loading||complete())return;clearTimeout(timer);const code=normalize(raw);$('scan').value='';
  if(!/^H[A-Z0-9]{12}$/.test(code)){say('Invalid garment barcode: '+code,'bad');focusScan();return;}
  const need=expected.get(code)||0,have=actual.get(code)||0;if(!need){say('Wrong garment / size. This tag is not in the selected order.','bad');focusScan();return;}
  if(have>=need){say('Extra scan rejected. The required quantity for this tag is already scanned.','bad');focusScan();return;}
  scans.push(code);actual.set(code,have+1);render();say('Accepted. '+scans.length+' of '+plan.itemCount+' pieces verified.','good');if(complete())void finish();else focusScan();
}
$('refresh').onclick=refreshQueue;$('findForm').onsubmit=e=>{e.preventDefault();void refreshQueue();};$('orderForm').onsubmit=e=>{e.preventDefault();void openOrder($('orderNo').value);};
$('scan').onkeydown=e=>{if(e.key==='Enter'||e.key==='Tab'){e.preventDefault();acceptScan(e.currentTarget.value);}};
$('scan').oninput=e=>{clearTimeout(timer);const input=e.currentTarget;timer=setTimeout(()=>{if(/^H[A-Z0-9]{12}$/i.test(input.value))acceptScan(input.value);},180);};
$('undo').onclick=()=>{if(finishing||!plan||plan.status!=='CONFIRMED')return;const code=scans.pop();if(!code)return;actual.set(code,(actual.get(code)||0)-1);$('retry').hidden=true;render();say('Last scan removed. Scan the correct piece.');focusScan();};
$('retry').onclick=finish;$('next').onclick=()=>{const order=queue.find(o=>o.orderNumber!==plan?.orderNumber);if(order)void openOrder(order.orderNumber,order);};
window.addEventListener('beforeunload',e=>{if(finishing||(plan?.status==='CONFIRMED'&&scans.length)){e.preventDefault();e.returnValue='';}});
void refreshQueue();const requested=new URL(location.href).searchParams.get('order');if(requested)void openOrder(requested);
