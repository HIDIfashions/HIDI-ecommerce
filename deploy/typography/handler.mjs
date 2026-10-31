import { readFileSync } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { fonts, fontSources, presets, validateConfig } from './registry.mjs';
import { fontFaces, publishedCss } from './css.mjs';
import { createAzureTypographyStore } from './storage.mjs';
export const adminPath = '/api/hidi/typography/admin';
const fail = (status, message) => Object.assign(new Error(message), {status});
export function initialState() {
  const profile = () => ({draft: structuredClone(presets.classic), published: null, previous: null});
  return {schema: 1, revision: 0, profiles: {storefront: profile(), admin: profile()}, history: []};
}
const assets = new Map();
for (const file of ['registry.mjs','editor.js','editor.css','refresh.js',...Object.values(fonts).flatMap(fontSources).map(f=>'fonts/'+f.file)]) {
  const body = readFileSync(new URL(file, import.meta.url));
  assets.set(file, {body, hash:createHash('sha256').update(body).digest('hex').slice(0,16), type:file.endsWith('.woff2')?'font/woff2':file.endsWith('.css')?'text/css; charset=utf-8':'text/javascript; charset=utf-8'});
}
const faces = Buffer.from(fontFaces());
assets.set('fonts.css', {body:faces,hash:createHash('sha256').update(faces).digest('hex').slice(0,16),type:'text/css; charset=utf-8'});
export function injectTypography(html, scope = 'storefront') {
  if (!/<html\b/i.test(html) || !/<\/head>/i.test(html) || html.includes('data-hidi-typography')) return html;
  const href = file => '/typography/assets/' + file + '?v=' + assets.get(file).hash;
  return html.replace(/<html\b/i, `<html data-hidi-type-scope="${scope === 'admin' ? 'admin' : 'storefront'}"`).replace(/<\/head>/i,
    `<link rel="stylesheet" href="${href('fonts.css')}" data-hidi-typography><link id="hidi-published-typography" rel="stylesheet" href="/typography/published.css"><script defer src="${href('refresh.js')}"></script></head>`);
}
export function sameOrigin(request) {
  if (request.headers['sec-fetch-site'] === 'cross-site') return false;
  try {
    const origin = new URL(request.headers.origin || '');
    return origin.host === request.headers.host && (origin.protocol === 'https:' || origin.protocol === 'http:' && ['localhost','127.0.0.1'].includes(origin.hostname));
  } catch { return false; }
}
async function readJson(request) {
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers['content-type'] || '')) throw fail(415,'Use JSON for typography changes.');
  let bytes = 0; const chunks = [];
  for await (const chunk of request) {bytes += chunk.length;if (bytes > 8192) throw fail(413,'Typography request is too large.');chunks.push(chunk);}
  try { const body = JSON.parse(Buffer.concat(chunks)); if (!body || typeof body !== 'object' || Array.isArray(body)) throw 0; return body; }
  catch { throw fail(400,'Invalid JSON.'); }
}
export function createTypographyHandler({origin, hasStorefront = true, store = createAzureTypographyStore(), requestFetch = fetch} = {}) {
  let lastGood;
  async function load() {
    const loaded = await store.load();
    const state = loaded.value || initialState();
    if (state.schema !== 1 || !Number.isSafeInteger(state.revision) || state.revision < 0 || !Array.isArray(state.history)) throw new Error('Invalid typography state');
    for (const scope of ['storefront','admin']) {
      validateConfig(state.profiles[scope].draft);
      if (state.profiles[scope].published) validateConfig(state.profiles[scope].published);
      if (state.profiles[scope].previous?.config) validateConfig(state.profiles[scope].previous.config);
    }
    if (!lastGood || state.revision >= lastGood.revision) lastGood = structuredClone(state);
    return {...loaded, value:structuredClone(state)};
  }
  async function owner(request) {
    if (!hasStorefront || !request.headers.cookie) throw fail(401,'Sign in as the owner to manage typography.');
    let response;
    try { response = await requestFetch(new URL('/api/admin/session',origin), {headers:{cookie:request.headers.cookie},redirect:'manual',signal:AbortSignal.timeout(5000)}); }
    catch { throw fail(503,'Staff verification is temporarily unavailable.'); }
    if (!response.ok) throw fail(response.status === 403 ? 403 : 401,'Staff sign-in required.');
    const profile = await response.json().catch(()=>null);
    if (profile?.admin?.role !== 'OWNER' || typeof profile.admin.id !== 'string') throw fail(403,'Only the owner can change typography.');
    return {id:profile.admin.id,displayName:String(profile.admin.displayName || 'Owner')};
  }
  function send(req,res,status,body,type='application/json; charset=utf-8',extra={}) {
    const data = Buffer.isBuffer(body) ? body : Buffer.from(type.startsWith('application/json') ? JSON.stringify(body) : body);
    res.writeHead(status, {'Content-Type':type,'Content-Length':data.length,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'same-origin',...extra});res.end(req.method === 'HEAD' ? undefined : data);
  }
  return async function handle(req,res,pathname) {
    if (![adminPath,'/api/hidi/typography','/typography/published.css','/admin/typography'].includes(pathname) && !pathname.startsWith('/typography/assets/')) return false;
    try {
      if (pathname !== adminPath && !['GET','HEAD'].includes(req.method)) throw fail(405,'Method not allowed.');
      if (pathname.startsWith('/typography/assets/')) {
        const asset = assets.get(pathname.slice('/typography/assets/'.length));
        if (!asset) throw fail(404,'Not found.');
        const version = new URL(req.url,'http://hidi.local').searchParams.get('v');
        send(req,res,200,asset.body,asset.type,{'Cache-Control':version===asset.hash?'public, max-age=31536000, immutable':'public, max-age=0, must-revalidate',ETag:'"'+asset.hash+'"'});
      } else if (pathname === '/admin/typography') {
        const html = injectTypography(readFileSync(new URL('editor.html',import.meta.url),'utf8'),'admin');
        send(req,res,200,html,'text/html; charset=utf-8',{'X-Robots-Tag':'noindex, nofollow','Content-Security-Policy':"default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'"});
      } else if (pathname === '/typography/published.css' || pathname === '/api/hidi/typography') {
        let state, stale = false;
        try { state = (await load()).value; } catch {if(!lastGood) throw new Error('Typography unavailable');state = lastGood;stale = true;}
        if (pathname.endsWith('.css')) send(req,res,200,publishedCss(state),'text/css; charset=utf-8',{'X-Hidi-Typography-Revision':String(state.revision),...(stale?{'X-Hidi-Typography-Stale':'true'}:{})});
        else send(req,res,200,{revision:state.revision,stale,profiles:Object.fromEntries(['storefront','admin'].map(scope=>[scope,state.profiles[scope].published]))});
      } else {
        if (!['GET','HEAD','POST'].includes(req.method)) throw fail(405,'Method not allowed.');
        if (req.method === 'POST' && !sameOrigin(req)) throw fail(403,'Make changes from the HIDI admin portal.');
        const actor = await owner(req);
        const loaded = await load(); const state = loaded.value;
        if (req.method !== 'POST') send(req,res,200,{...state,etag:loaded.etag});
        else {
          const body = await readJson(req);
          if (!Object.hasOwn(body,'etag') || body.etag !== loaded.etag) throw fail(409,'Typography changed in another session. Reload before saving.');
          if (!['storefront','admin'].includes(body.profile)) throw fail(400,'Choose storefront or admin typography.');
          const profile = state.profiles[body.profile]; const now = new Date().toISOString();
          if (body.action === 'save') {
            const config=validateConfig(body.config);
            // Older open editors submit only font families. Preserve existing size
            // settings unless the editor explicitly supplies the sizes object.
            if(!Object.hasOwn(config,'sizes')&&profile.draft.sizes)config.sizes=structuredClone(profile.draft.sizes);
            profile.draft=config;profile.savedAt = now;profile.savedBy = actor;
          }
          else if (body.action === 'publish' || body.action === 'rollback') {
            if (body.action === 'rollback' && !profile.previous) throw fail(409,'No previous publication is available.');
            const config = body.action === 'publish' ? validateConfig(profile.draft) : profile.previous.config;
            if (JSON.stringify(config) === JSON.stringify(profile.published)) {send(req,res,200,{...state,etag:loaded.etag});return true;}
            const previous = structuredClone(profile.published);
            profile.published = structuredClone(config);profile.previous = {config:previous};state.revision++;
            const revision = {id:randomUUID(),version:state.revision,profile:body.profile,action:body.action,config,publishedAt:now,publishedBy:actor};
            await store.archive(revision);
            state.history = [revision,...state.history].slice(0,200);
          } else throw fail(400,'Choose save, publish or rollback.');
          const saved = await store.save(state,loaded.etag);lastGood = structuredClone(state);
          send(req,res,200,{...state,etag:saved.etag});
        }
      }
    } catch (error) {send(req,res,error.status || 503,{message:error.status ? error.message : 'Typography is temporarily unavailable. Your published fonts have not been changed.'});}
    return true;
  };
}
