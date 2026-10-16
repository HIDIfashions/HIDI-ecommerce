import { NextRequest, NextResponse } from 'next/server';
import { API_URL } from '@/lib/api';
import { adminApiHeaders, isAdminRequest } from '@/lib/admin-auth';
export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'private, no-store, max-age=0', Vary: 'Cookie', 'X-Robots-Tag': 'noindex, nofollow' };
const routes: Record<string, readonly string[]> = { overview: ['from', 'to'], queue: ['kind', 'status', 'q', 'page'], search: ['q'] };
export async function GET(request: NextRequest, context: { params: Promise<{ resource: string }> }) {
  if (!isAdminRequest(request)) return NextResponse.json({ message: 'Admin session required' }, { status: 401, headers });
  const { resource } = await context.params;
  if (!Object.prototype.hasOwnProperty.call(routes, resource)) return NextResponse.json({ message: 'Unknown admin view' }, { status: 404, headers });
  const query = new URLSearchParams();
  for (const key of routes[resource]) { const value = request.nextUrl.searchParams.get(key); if (value !== null) query.set(key, value); }
  try {
    const response = await fetch(`${API_URL.replace(/\/$/, '')}/admin/dashboard/${resource}?${query}`, { headers: adminApiHeaders(request), cache: 'no-store', signal: AbortSignal.timeout(20000) });
    const body = await response.json().catch(() => ({ message: 'Invalid reporting response' }));
    if (response.status >= 500) return NextResponse.json({ message: 'Reporting is temporarily unavailable. Please retry.' }, { status: 502, headers });
    return NextResponse.json(body, { status: response.status, headers });
  } catch { return NextResponse.json({ message: 'Unable to reach HIDI reporting. Please retry.' }, { status: 502, headers }); }
}
