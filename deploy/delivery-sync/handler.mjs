// Retained production server adapter for the new independent COD endpoint.
export async function handleCodCollection(req, res, pathname) {
  if (!/^\/api\/admin\/orders\/[^/]+\/cod-collection$/.test(pathname)) return false;
  const fail = (status, message) => Object.assign(new Error(message), { status });
  let status = 200, body;
  try {
    if (req.method !== 'POST') throw fail(405, 'Method not allowed');
    const cookie = (req.headers.cookie || '').split(';').map(s => s.trim()).find(s => s.startsWith('hidi_admin_access='));
    const token = cookie ? decodeURIComponent(cookie.slice('hidi_admin_access='.length)) : '';
    if (!token || /\s/.test(token)) throw fail(401, 'Admin session expired');
    if (req.headers['sec-fetch-site'] === 'cross-site') throw fail(403, 'Use the HIDI admin page');
    if (req.headers.origin && new URL(req.headers.origin).host !== req.headers.host) throw fail(403, 'Same-origin request required');
    const chunks = []; let size = 0;
    for await (const chunk of req) { size += chunk.length; if (size > 4096) throw fail(413, 'Request too large'); chunks.push(chunk); }
    let payload; try { payload = JSON.parse(Buffer.concat(chunks).toString()); } catch { throw fail(400, 'Invalid JSON'); }
    if (payload?.confirmed !== true || !Number.isSafeInteger(payload.amountPaise) || payload.amountPaise <= 0) throw fail(400, 'Confirm the exact COD amount collected');
    const api = process.env.INTERNAL_API_URL || process.env.API_URL;
    if (!api) throw fail(503, 'API unavailable');
    const response = await fetch(api.replace(/\/$/, '') + pathname.replace('/api/admin', '/admin'), {
      method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ confirmed: true, amountPaise: payload.amountPaise }), redirect: 'manual', signal: AbortSignal.timeout(20000),
    });
    status = response.status; body = await response.json();
  } catch (error) { status = error.status || 502; body = { message: error.status ? error.message : 'Unable to reach the HIDI API' }; }
  res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'private, no-store', 'vary': 'Cookie' });
  res.end(JSON.stringify(body)); return true;
}
