const byId=id=>document.getElementById(id);let preview;
const currency=n=>new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR'}).format(n/100);
const phrase=()=>preview?'DELETE BEFORE '+preview.before:'';
async function request(method,body){const r=await fetch('/api/admin/sales-deletion'+(method==='GET'?'?before='+encodeURIComponent(byId('before').value):''),{method,headers:{'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{}),cache:'no-store'});const data=await r.json();if(!r.ok)throw Error(data.message||'Unable to update sales');return data;}
function reset(){preview=null;byId('preview').hidden=true;byId('delete-button').disabled=true;byId('confirmation').value='';}
byId('before').addEventListener('input',reset);
byId('preview-form').addEventListener('submit',async event=>{event.preventDefault();reset();byId('preview-button').disabled=true;byId('error').textContent='';try{
  preview=await request('GET');byId('summary').textContent=`${preview.count} records · ${currency(preview.totalPaise)}`;byId('orders').replaceChildren();
  for(const order of preview.orders){const row=document.createElement('tr');for(const value of [order.orderNumber,new Date(order.createdAt).toLocaleString('en-IN',{timeZone:'Asia/Kolkata'}),order.status,currency(order.totalPaise)]){const cell=document.createElement('td');cell.textContent=value;row.append(cell);}byId('orders').append(row);}
  byId('confirm-label').textContent='Type '+phrase()+' to confirm';byId('preview').hidden=false;byId('delete-form').hidden=!preview.count;byId('status').textContent=preview.count?'Review these records before deleting.':'No records match this cutoff.';
}catch(error){byId('error').textContent=error.message;}finally{byId('preview-button').disabled=false;}});
byId('confirmation').addEventListener('input',()=>{byId('delete-button').disabled=!preview||byId('confirmation').value!==phrase();});
byId('delete-form').addEventListener('submit',async event=>{event.preventDefault();if(!preview||byId('confirmation').value!==phrase())return;byId('delete-button').disabled=true;byId('preview-button').disabled=true;byId('error').textContent='';try{const result=await request('DELETE',{before:preview.before,snapshot:preview.snapshot,confirmation:byId('confirmation').value});reset();byId('status').textContent=`Deleted ${result.deleted} sales records. Orders from the cutoff date onward were kept.`;}catch(error){reset();byId('error').textContent=error.message+' Preview again before retrying.';}finally{byId('preview-button').disabled=false;}});
