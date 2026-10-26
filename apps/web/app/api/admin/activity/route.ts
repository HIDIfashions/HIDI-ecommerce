import { NextRequest, NextResponse } from 'next/server';
import { API_URL } from '@/lib/api';
import { adminApiHeaders } from '@/lib/admin-auth';
export async function POST(request: NextRequest) {
  try {
    if(request.headers.get('sec-fetch-site')==='cross-site'||new URL(request.headers.get('origin')??'').host!==request.headers.get('host'))return NextResponse.json({message:'Same-origin request required'},{status:403});
    const r=await fetch(`${API_URL}/auth/admin/activity`,{method:'POST',headers:adminApiHeaders(request),cache:'no-store'});
    return NextResponse.json(await r.json(),{status:r.status});
  }catch{return NextResponse.json({message:'Unable to record admin activity'},{status:503});}
}
