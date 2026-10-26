const byId=id=>document.getElementById(id);
let email='',busy=false;
async function request(path,body,method='POST'){
  const r=await fetch(path,{method,headers:{'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{}),cache:'no-store'});
  const data=await r.json();if(!r.ok)throw Error(data.message||'Unable to sign in');return data;
}
// Visiting the sign-in form never silently restores a remembered login.
const signedOut=request('/api/admin/session',null,'DELETE').catch(()=>{});
byId('email-form').addEventListener('submit',async e=>{
  e.preventDefault();if(busy)return;busy=true;byId('send').disabled=true;byId('error').textContent='';
  try{await signedOut;email=byId('email').value.trim().toLowerCase();await request('/api/store/auth/admin/otp/request',{email});byId('otp-form').hidden=false;byId('status').textContent='Code sent. Check your email inbox.';byId('otp').focus();}
  catch(error){byId('error').textContent=error.message;}finally{busy=false;byId('send').disabled=false;}
});
byId('otp-form').addEventListener('submit',async e=>{
  e.preventDefault();if(busy)return;busy=true;byId('verify').disabled=true;byId('error').textContent='';
  try{await request('/api/admin/session',{email,token:byId('otp').value.trim()});localStorage.removeItem('hidi-admin-last-activity');location.replace('/admin');}
  catch(error){byId('error').textContent=error.message;busy=false;byId('verify').disabled=false;}
});
