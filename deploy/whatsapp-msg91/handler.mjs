// The retained storefront's exact callback route. Never forward browser cookies.
export async function handleMsg91Ordering(req, res, pathname, requestFetch = fetch) {
  if (pathname !== '/api/store/whatsapp/msg91/webhook') return false;
  const fail = (status, message) => Object.assign(new Error(message), { status });
  let status, body;
  try {
    if (req.method !== 'POST') throw fail(405, 'Method not allowed');
    const token = req.headers['x-hidi-whatsapp-token'];
    if (typeof token !== 'string' || token.length < 32 || token.length > 512) throw fail(401, 'Invalid callback credentials');
    if (!/^application\/json(?:;|$)/i.test(req.headers['content-type'] || '')) throw fail(415, 'Use application/json');
    const api = process.env.INTERNAL_API_URL || process.env.API_URL;
    if (!api) throw fail(503, 'Ordering API unavailable');
    const chunks = []; let size = 0;
    for await (const chunk of req) {
      size += chunk.length;
      if (size > 16384) throw fail(413, 'Callback too large');
      chunks.push(chunk);
    }
    const response = await requestFetch(api.replace(/\/$/, '') + '/whatsapp/msg91/webhook', {
      method: 'POST', headers: { 'content-type': 'application/json', 'x-hidi-whatsapp-token': token },
      body: Buffer.concat(chunks), redirect: 'manual', signal: AbortSignal.timeout(10000),
    });
    if (response.status >= 300 && response.status < 400) throw fail(502, 'Ordering API unavailable');
    status = response.status; body = await response.json();
  } catch (error) {
    status = error.status || 502;
    body = { message: error.status ? error.message : 'Ordering API unavailable' };
  }
  res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
  res.end(JSON.stringify(body)); return true;
}
