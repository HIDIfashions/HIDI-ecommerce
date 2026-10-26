import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {createAdminSecurityHandler} from './handler.mjs';
test('OTP-only session creation, session cookie, CSRF, no refresh activity, owner deletion and revocation',async()=>{
  const token='hidi_admin_'+'a'.repeat(64),calls=[];
  let active=true,email='fashionshidi@gmail.com';
  const handler=createAdminSecurityHandler({apiBase:'https://fixture/v1',requestFetch:async(url,options)=>{
    calls.push({url,options});
    if(url.endsWith('/otp/verify'))return Response.json({sessionToken:token,admin:{email,role:'OWNER'}});
    if(url.endsWith('/auth/admin/session')){active=false;return Response.json({ok:true});}
    if(!active)return Response.json({message:'Expired'},{status:401});
    return Response.json({admin:{email,role:'OWNER'},ok:true});
  }});
  const server=createServer(async(req,res)=>{if(!await handler(req,res,new URL(req.url,'http://local').pathname)){res.writeHead(404);res.end();}});
  await new Promise(done=>server.listen(0,'127.0.0.1',done));const base='http://127.0.0.1:'+server.address().port;
  const request=(path,method='GET',body,extra={})=>fetch(base+path,{method,headers:{origin:base,'content-type':'application/json',cookie:'hidi_admin_access='+token,...extra},...(body?{body:JSON.stringify(body)}:{})});
  try{
    assert.equal((await request('/api/admin/session','POST',{accessToken:'saved',refreshToken:'saved'})).status,401);
    assert.equal(calls.length,0);
    assert.equal((await request('/api/admin/session','POST',{email,token:'12345678'},{origin:'https://evil.invalid'})).status,403);
    const login=await request('/api/admin/session','POST',{email,token:'12345678'},{cookie:''});assert.equal(login.status,200);
    const cookies=login.headers.getSetCookie();assert(cookies.some(s=>s.startsWith('hidi_admin_access=hidi_admin_')&&!s.includes('Max-Age')&&s.includes('HttpOnly')));
    assert(!JSON.stringify(await login.json()).includes(token));
    assert.equal((await request('/api/admin/session','PUT')).status,200);assert(!calls.some(c=>c.url.endsWith('/activity')));
    assert.equal((await request('/api/admin/activity','POST')).status,200);assert(calls.some(c=>c.url.endsWith('/activity')));
    assert.equal((await request('/admin/sales-delete')).status,200);
    email='other@example.invalid';assert.equal((await request('/admin/sales-delete')).status,403);
    assert.equal((await request('/api/admin/session','DELETE')).status,200);
    assert.equal((await request('/api/admin/session')).status,401);
    assert.equal((await request('/api/admin/session','PUT')).status,401);
  }finally{await new Promise(done=>server.close(done));}
});
