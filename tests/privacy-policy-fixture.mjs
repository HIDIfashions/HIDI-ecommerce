import { createServer } from 'node:http';
import { once } from 'node:events';
import { pathToFileURL } from 'node:url';
import { createPrivacyPolicyHandler as sourceHandler } from '../deploy/privacy-policy/handler.mjs';
import { readFileSync } from 'node:fs';

export async function privacyFixture() {
  const fixture = { state: null, generation: 0, archives: new Map(), rejectSave: false };
  const store = {
    load: async () => ({ value: structuredClone(fixture.state), etag: fixture.generation ? `"${fixture.generation}"` : null }),
    save: async (state, etag) => {
      if (fixture.rejectSave || etag !== (fixture.generation ? `"${fixture.generation}"` : null)) throw Object.assign(new Error('Policy changed in another session. Reload before saving.'), { status: 409 });
      fixture.state = structuredClone(state); fixture.generation++; return { etag: `"${fixture.generation}"` };
    },
    archive: async version => { fixture.archives.set(version.id, structuredClone(version)); },
    version: async id => ({ value: structuredClone(fixture.archives.get(id) || null) }),
  };
  const upstream = createServer((request, response) => {
    const role = /fixture_role=(OWNER|OPERATIONS|SUPPORT|CATALOG)/.exec(request.headers.cookie || '')?.[1];
    if (request.url === '/api/admin/session') { response.writeHead(role ? 200 : 401, { 'content-type': 'application/json' }); response.end(JSON.stringify(role ? { admin: { id: 'fixture-' + role, role, displayName: 'Fixture Owner' } } : {})); return; }
    response.writeHead(404); response.end();
  });
  upstream.listen(0, '127.0.0.1'); await once(upstream, 'listening');
  const createHandler = process.env.PRIVACY_HANDLER_FILE ? (await import(pathToFileURL(process.env.PRIVACY_HANDLER_FILE))).createPrivacyPolicyHandler : sourceHandler;
  const handler = createHandler({ origin: new URL(`http://127.0.0.1:${upstream.address().port}`), hasStorefront: true, store });
  const linksFile = process.env.PRIVACY_HANDLER_FILE ? new URL('./links.js', pathToFileURL(process.env.PRIVACY_HANDLER_FILE)) : new URL('../deploy/privacy-policy/links.js', import.meta.url);
  const server = createServer(async (request, response) => {
    if (await handler(request, response, new URL(request.url, 'http://localhost').pathname)) return;
    if (request.url === '/fixture-links') { response.writeHead(200, { 'content-type': 'text/html' }); response.end('<!doctype html><nav aria-label="Admin navigation"></nav><footer class="site-footer"><button onclick="window.oldPrivacy=true">Privacy policy</button><button onclick="window.otherPolicy=true">Returns</button></footer><footer class="footer"><div class="footer-bottom"><span>Copyright</span><span>Support</span></div></footer><script>' + readFileSync(linksFile, 'utf8') + '</script>'); return; }
    response.writeHead(404); response.end();
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening'); fixture.url = `http://127.0.0.1:${server.address().port}`;
  fixture.close = async () => { server.closeAllConnections(); upstream.closeAllConnections(); await Promise.all([new Promise(resolve => server.close(resolve)), new Promise(resolve => upstream.close(resolve))]); };
  return fixture;
}
