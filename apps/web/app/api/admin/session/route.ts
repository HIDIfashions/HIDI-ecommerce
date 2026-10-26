import { NextRequest, NextResponse } from 'next/server';
import { API_URL } from '@/lib/api';
import { adminApiHeaders, adminAccessCookieOptions, ADMIN_ACCESS_COOKIE_NAME } from '@/lib/admin-auth';
const clear = (r: NextResponse) => { for (const name of ['hidi_admin_access','hidi_admin_refresh','hidi_admin_session']) r.cookies.set(name,'',{...adminAccessCookieOptions(),maxAge:0}); return r; };
function sameOrigin(request: NextRequest) {
  if (request.headers.get('sec-fetch-site') === 'cross-site') return false;
  try { return new URL(request.headers.get('origin') ?? '').host === request.headers.get('host'); } catch { return false; }
}
export async function GET(request: NextRequest) {
  try { const r=await fetch(`${API_URL}/admin/me`,{headers:adminApiHeaders(request),cache:'no-store'}); const response=NextResponse.json(await r.json(),{status:r.status}); return r.status===401?clear(response):response; }
  catch { return NextResponse.json({message:'Admin service temporarily unavailable'},{status:503}); }
}
export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return NextResponse.json({message:'Same-origin request required'},{status:403});
  const body=await request.json().catch(()=>null);
  if (!body || Object.keys(body).some(k=>!['email','token'].includes(k))) return NextResponse.json({message:'A fresh email OTP is required for every login'},{status:401});
  try {
    const r=await fetch(`${API_URL}/auth/admin/otp/verify`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body),cache:'no-store'});
    const data=await r.json(); if(!r.ok)return NextResponse.json({message:data.message},{status:r.status});
    await fetch(`${API_URL}/auth/admin/session`,{method:'DELETE',headers:adminApiHeaders(request),cache:'no-store'});
    const response=clear(NextResponse.json({ok:true,admin:data.admin,idleTimeoutSeconds:3600}));
    response.cookies.set(ADMIN_ACCESS_COOKIE_NAME,data.sessionToken,adminAccessCookieOptions());return response;
  } catch { return NextResponse.json({message:'Unable to verify admin OTP'},{status:503}); }
}
export async function PUT(request: NextRequest) {
  if (!sameOrigin(request)) return NextResponse.json({message:'Same-origin request required'},{status:403});
  return GET(request);
}
export async function DELETE(request: NextRequest) {
  if (!sameOrigin(request)) return NextResponse.json({message:'Same-origin request required'},{status:403});
  try { const r=await fetch(`${API_URL}/auth/admin/session`,{method:'DELETE',headers:adminApiHeaders(request),cache:'no-store'}); if(!r.ok)throw Error(); return clear(NextResponse.json({ok:true})); }
  catch { return NextResponse.json({message:'Unable to sign out; retry shortly'},{status:503}); }
}
