import { readFile } from 'node:fs/promises';
const assets = new Map([['/support-assets/admin.mjs','admin.mjs'],['/support-assets/styles.css','styles.css'],['/support-assets/navigation.mjs','navigation.mjs']]);
const fail = (status, message) => Object.assign(new Error(message), { status });
export function createSupportHandler({ origin, apiBase = process.env.API_URL, requestFetch = fetch }) {
  return async (req, res, path) => {
    const page = path === '/admin/support' || path === '/admin/staff';
    const proxy = path === '/api/admin/support' || /^\/api\/admin\/orders\/[^/]+\/support(?:\/[^/]+\/decision)?$/.test(path);
    if (!page && !proxy && !assets.has(path)) return false;
    let status = 200, type = 'application/json', body;
    try {
      if (assets.has(path)) {
        if (!['GET','HEAD'].includes(req.method)) throw fail(405,'Method not allowed');
        type = path.endsWith('.css') ? 'text/css' : 'text/javascript';
        body = await readFile(new URL(assets.get(path), import.meta.url));
      } else {
        if (page && !['GET','HEAD'].includes(req.method) || proxy && !['GET','HEAD','POST'].includes(req.method)) throw fail(405,'Method not allowed');
        if (req.method === 'POST') {
          if (req.headers['sec-fetch-site'] === 'cross-site') throw fail(403,'Use the HIDI admin page');
          let source; try { source = new URL(req.headers.origin); } catch { throw fail(403,'Same-origin request required'); }
          if (source.host !== req.headers.host || !['http:','https:'].includes(source.protocol)) throw fail(403,'Same-origin request required');
        }
        if (!req.headers.cookie) throw fail(401,'Staff sign-in required');
        const verified = await requestFetch(new URL('/api/admin/session', origin), { headers: { cookie: req.headers.cookie }, cache: 'no-store', redirect: 'manual', signal: AbortSignal.timeout(10000) });
        if (!verified.ok) throw fail(verified.status === 403 ? 403 : 401,'Staff sign-in required');
        const session = await verified.json();
        const role = session?.admin?.role;
        if (!['OWNER','OPERATIONS','SUPPORT'].includes(role)) throw fail(403,'Your role cannot access support');
        if (path === '/admin/staff' && role !== 'OWNER' || path.endsWith('/decision') && role !== 'OWNER') throw fail(403,'Owner access required');
        if (page) { type = 'text/html'; body = await readFile(new URL('admin.html', import.meta.url)); }
        else {
          const cookie = req.headers.cookie.split(';').map(value => value.trim()).find(value => value.startsWith('hidi_admin_access='));
          const token = cookie ? decodeURIComponent(cookie.slice('hidi_admin_access='.length)) : '';
          if (!token || /\s/.test(token)) throw fail(401,'Sign in with your individual staff email');
          let payload;
          if (req.method === 'POST') {
            if (!/^application\/json(?:;|$)/i.test(req.headers['content-type'] || '')) throw fail(415,'Use application/json');
            const chunks = []; let size = 0;
            for await (const chunk of req) { size += chunk.length; if (size > 16384) throw fail(413,'Support update is too large'); chunks.push(chunk); }
            try { payload = JSON.parse(Buffer.concat(chunks).toString()); } catch { throw fail(400,'Invalid JSON'); }
            if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw fail(400,'Invalid support update');
          }
          if (!apiBase) throw fail(503,'Support API is not configured');
          const response = await requestFetch(apiBase.replace(/\/$/,'') + path.replace('/api/admin','/admin'), {
            method: req.method === 'HEAD' ? 'GET' : req.method, headers: { authorization: `Bearer ${token}`, 'content-type':'application/json' },
            ...(payload ? { body: JSON.stringify(payload) } : {}), cache:'no-store', redirect:'manual', signal:AbortSignal.timeout(15000),
          });
          status = response.status; body = Buffer.from(JSON.stringify(await response.json()));
        }
      }
    } catch (error) { status = error.status || 503; type = 'application/json'; body = Buffer.from(JSON.stringify({ message: error.status ? error.message : 'Support temporarily unavailable. Please retry.' })); }
    res.writeHead(status, { 'Content-Type':type+'; charset=utf-8','Content-Length':body.length,'Cache-Control':'private, no-store','Vary':'Cookie','X-Robots-Tag':'noindex, nofollow','X-Content-Type-Options':'nosniff','Referrer-Policy':'same-origin','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'; form-action 'self'" });
    res.end(req.method === 'HEAD' ? undefined : body); return true;
  };
}
