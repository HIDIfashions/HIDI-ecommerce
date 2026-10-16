import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer, request as httpRequest } from 'node:http';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { injectButtonTheme, handleButtonTheme, wrapButtonTheme } from '../deploy/button-states/handler.mjs';

const html = '<!doctype html><html lang="en"><head><title>HIDI</title></head><body>Ivory ₹ हिन्दी</body></html>';
const expectedHtml = injectButtonTheme(html);
const asset = extension => {
  const body = readFileSync(new URL(`../deploy/button-states/buttons.${extension}`, import.meta.url));
  return { body, version: createHash('sha256').update(body).digest('hex').slice(0, 16) };
};

// Real HTTP catches invalid header combinations and implicit-header conventions
// that a fake response object cannot detect.
async function exchange({ path = '/admin/products', method = 'GET', headers = {}, respond }) {
  let handlerError;
  const server = createServer((req, res) => {
    try {
      const pathname = new URL(req.url, 'http://hidi.local').pathname;
      if (handleButtonTheme(req, res, pathname)) return;
      wrapButtonTheme(req, res, pathname);
      respond(req, res);
    } catch (error) {
      handlerError = error;
      res.destroy(error);
    }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const result = await new Promise((resolve, reject) => {
      const req = httpRequest({ hostname: '127.0.0.1', port: server.address().port, path, method, headers, agent: false }, res => {
        const chunks = [];
        res.on('data', chunk => chunks.push(chunk));
        res.on('error', reject);
        res.on('aborted', () => reject(new Error('Response aborted')));
        res.on('end', () => resolve({ status: res.statusCode, statusMessage: res.statusMessage, headers: res.headers, rawHeaders: res.rawHeaders, body: Buffer.concat(chunks) }));
      });
      req.on('error', reject);
      req.setTimeout(2_000, () => req.destroy(new Error('HTTP regression fixture timed out')));
      req.end();
    });
    if (handlerError) throw handlerError;
    return result;
  } finally {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
}

const completeHtml = (_req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Content-Length': Buffer.byteLength(html) });
  res.end(html);
};

test('complete HTML gains one document marker and content-versioned CSS and deferred JS', () => {
  assert.match(expectedHtml, /<html data-hidi-button-theme="site" lang="en">/);
  for (const extension of ['css', 'js']) {
    assert.ok(expectedHtml.includes(`/button-states/buttons.${extension}?v=${asset(extension).version}`));
  }
  assert.match(expectedHtml, /<script defer src="\/button-states\/buttons\.js\?v=[a-f0-9]{16}"/);
  assert.equal((expectedHtml.match(/data-hidi-button-states="v1"/g) || []).length, 2);
  assert.ok(expectedHtml.endsWith('<body>Ivory ₹ हिन्दी</body></html>'));
  assert.equal(injectButtonTheme(expectedHtml), expectedHtml, 'injection is idempotent');
});

test('HTML injection preserves fragments, plain text and missing heads', () => {
  for (const value of ['', '<div>Fragment</div>', 'plain text', '<html><body>No head</body></html>', '{"type":"html"}']) {
    assert.equal(injectButtonTheme(value), value);
  }
  const upper = injectButtonTheme('<HTML lang="en"><HEAD></HEAD><BODY>Uppercase</BODY></HTML>');
  assert.match(upper, /data-hidi-button-theme="site"/);
  assert.equal(injectButtonTheme(upper), upper);
});

test('an existing injected theme receives a missing root marker without duplicating assets', () => {
  const existing = expectedHtml.replace(' data-hidi-button-theme="site"', '');
  assert.equal(injectButtonTheme(existing), expectedHtml);
});

test('CSS and JS GET and HEAD serve exact bytes with versioned caching', async () => {
  for (const extension of ['css', 'js']) {
    const expected = asset(extension);
    const path = `/button-states/buttons.${extension}?v=${expected.version}`;
    const get = await exchange({ path, respond: () => assert.fail('Asset reached downstream handler') });
    assert.equal(get.status, 200);
    assert.deepEqual(get.body, expected.body);
    assert.equal(get.headers['content-length'], String(expected.body.length));
    assert.equal(get.headers['content-type'], `${extension === 'css' ? 'text/css' : 'text/javascript'}; charset=utf-8`);
    assert.equal(get.headers['cache-control'], 'public, max-age=31536000, immutable');
    assert.equal(get.headers.etag, `"${expected.version}"`);
    assert.equal(get.headers['x-content-type-options'], 'nosniff');
    const head = await exchange({ path, method: 'HEAD', respond: () => assert.fail('Asset reached downstream handler') });
    assert.equal(head.status, 200);
    assert.equal(head.body.length, 0);
    assert.equal(head.headers['content-length'], get.headers['content-length']);
    assert.equal(head.headers.etag, get.headers.etag);
    for (const suffix of ['', '?v=stale']) {
      const stale = await exchange({ path: `/button-states/buttons.${extension}${suffix}`, respond: () => assert.fail('Asset reached downstream handler') });
      assert.equal(stale.headers['cache-control'], 'no-cache');
    }
  }
});

test('theme assets accept only GET or HEAD and never capture neighboring paths', async () => {
  for (const method of ['POST', 'PUT', 'DELETE', 'OPTIONS']) {
    const response = await exchange({ path: '/button-states/buttons.css', method, respond: () => assert.fail('Unsupported asset method reached downstream handler') });
    assert.equal(response.status, 405);
    assert.equal(response.headers.allow, 'GET, HEAD');
    assert.equal(response.headers['cache-control'], 'no-store');
    assert.equal(response.body.length, 0);
  }
  for (const path of ['/button-states/buttons.css/extra', '/button-states/buttons.css.map', '/button-states/unknown.js']) {
    const response = await exchange({ path, respond: (_req, res) => { res.writeHead(418); res.end('downstream'); } });
    assert.equal(response.status, 418);
    assert.equal(response.body.toString(), 'downstream');
  }
});

test('Admin and privacy complete HTML update byte length and remove stale validators', async () => {
  for (const path of ['/admin', '/admin/products?search=ivory', '/privacy', '/packing-scanner-control.html']) {
    let ended = 0;
    const response = await exchange({ path, respond: (_req, res) => {
      res.setHeader('X-Existing', 'retained');
      res.writeHead(200, 'Theme Ready', {
        'Content-Type': 'text/html; charset=utf-8', 'Content-Length': Buffer.byteLength(html),
        ETag: '"old"', 'Content-MD5': 'old', 'Cache-Control': 'private, no-store',
        'Set-Cookie': ['first=1; HttpOnly', 'second=2; SameSite=Lax'],
      });
      res.end(html, 'utf8', () => ended++);
    } });
    assert.equal(response.status, 200);
    assert.equal(response.statusMessage, 'Theme Ready');
    assert.equal(response.body.toString(), expectedHtml);
    assert.equal(response.headers['content-length'], String(Buffer.byteLength(expectedHtml)));
    assert.equal(response.headers.etag, undefined);
    assert.equal(response.headers['content-md5'], undefined);
    assert.equal(response.headers['x-existing'], 'retained');
    assert.equal(response.headers['cache-control'], 'private, no-store');
    assert.deepEqual(response.headers['set-cookie'], ['first=1; HttpOnly', 'second=2; SameSite=Lax']);
    assert.equal(ended, 1, 'end callback executes exactly once');
  }
});

test('implicit Node HTML headers remain valid and are injected', async () => {
  const response = await exchange({ respond: (_req, res) => {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Content-Length', Buffer.byteLength(html));
    res.end(html);
  } });
  assert.equal(response.body.toString(), expectedHtml);
  assert.equal(response.headers['content-length'], String(Buffer.byteLength(expectedHtml)));
});

test('raw header arrays preserve repeated cookies during HTML injection', async () => {
  const response = await exchange({ respond: (_req, res) => {
    res.writeHead(200, ['Content-Type', 'text/html; charset=utf-8', 'Set-Cookie', 'first=1', 'Set-Cookie', 'second=2']);
    res.end(html);
  } });
  assert.equal(response.body.toString(), expectedHtml);
  assert.deepEqual(response.headers['set-cookie'], ['first=1', 'second=2']);
});

test('explicit chunked complete HTML never gains conflicting Content-Length', async () => {
  const response = await exchange({ respond: (_req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Transfer-Encoding': 'chunked' });
    res.end(html);
  } });
  assert.equal(response.body.toString(), expectedHtml);
  assert.equal(response.headers['transfer-encoding'], 'chunked');
  assert.equal(response.headers['content-length'], undefined);
});

test('Buffer and Uint8Array bodies support valid end callbacks', async () => {
  for (const body of [Buffer.from(html), new Uint8Array(Buffer.from(html))]) {
    let ended = 0;
    const response = await exchange({ respond: (_req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(body, () => ended++);
    } });
    assert.equal(response.body.toString(), expectedHtml);
    assert.equal(ended, 1);
  }
});

test('streamed HTML is byte-preserved with valid original headers and callbacks', async () => {
  let written = 0;
  let ended = 0;
  const response = await exchange({ respond: (_req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Content-Length': Buffer.byteLength(html), ETag: '"stream"' });
    res.write(html.slice(0, 50), 'utf8', () => written++);
    res.end(html.slice(50), 'utf8', () => ended++);
  } });
  assert.equal(response.body.toString(), html);
  assert.equal(response.headers['content-length'], String(Buffer.byteLength(html)));
  assert.equal(response.headers.etag, '"stream"');
  assert.equal(written, 1);
  assert.equal(ended, 1);
});

test('explicit header flushing leaves streaming HTML valid and unchanged', async () => {
  const response = await exchange({ respond: (_req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'X-Stream': 'retained' });
    res.flushHeaders();
    res.write(html.slice(0, 50));
    res.end(html.slice(50));
  } });
  assert.equal(response.body.toString(), html);
  assert.equal(response.headers['content-type'], 'text/html; charset=utf-8');
  assert.equal(response.headers['x-stream'], 'retained');
});

test('implicit headers on write and flushHeaders preserve streamed HTML', async () => {
  for (const flushFirst of [false, true]) {
    const response = await exchange({ respond: (_req, res) => {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('X-Stream', 'implicit');
      if (flushFirst) res.flushHeaders();
      res.write(html.slice(0, 50));
      res.end(html.slice(50));
    } });
    assert.equal(response.body.toString(), html);
    assert.equal(response.headers['content-type'], 'text/html; charset=utf-8');
    assert.equal(response.headers['x-stream'], 'implicit');
  }
});

test('JSON, RSC, prefetch, compressed HTML and non-2xx responses retain original bytes', async () => {
  const compressed = gzipSync(html);
  const cases = [
    { contentType: 'application/json', body: Buffer.from('{"html":"<html><head></head></html>"}') },
    { contentType: 'text/x-component', body: Buffer.from('0:{"html":"<html><head></head></html>"}') },
    { contentType: 'text/html; charset=utf-8', body: Buffer.from(html), requestHeaders: { rsc: '1' } },
    { contentType: 'text/html; charset=utf-8', body: Buffer.from(html), requestHeaders: { 'next-router-prefetch': '1' } },
    { contentType: 'text/html; charset=utf-8', body: compressed, extraHeaders: { 'Content-Encoding': 'gzip' } },
    { contentType: 'text/html; charset=utf-8', body: Buffer.from(html), status: 403 },
    { contentType: 'text/html; charset=utf-8', body: Buffer.from(html), status: 404 },
  ];
  for (const fixture of cases) {
    const response = await exchange({ headers: fixture.requestHeaders, respond: (_req, res) => {
      res.writeHead(fixture.status || 200, { 'Content-Type': fixture.contentType, 'Content-Length': fixture.body.length, ETag: '"original"', ...fixture.extraHeaders });
      res.end(fixture.body);
    } });
    assert.equal(response.status, fixture.status || 200);
    assert.deepEqual(response.body, fixture.body);
    assert.equal(response.headers.etag, '"original"');
    assert.equal(response.headers['content-length'], String(fixture.body.length));
  }
});

test('storefront, unrelated Admin-looking paths and POST HTML are not response-wrapped', async () => {
  for (const fixture of [{ path: '/' }, { path: '/products/saree' }, { path: '/administrator' }, { path: '/privacy-policy' }, { path: '/admin/products', method: 'POST' }]) {
    const response = await exchange({ ...fixture, respond: completeHtml });
    assert.equal(response.body.toString(), html);
    assert.equal(response.headers['content-length'], String(Buffer.byteLength(html)));
  }
});

test('empty HTML HEAD and end-callback-only responses preserve Node conventions', async () => {
  const head = await exchange({ method: 'HEAD', respond: completeHtml });
  assert.equal(head.body.length, 0);
  assert.equal(head.headers['content-length'], String(Buffer.byteLength(html)));
  let ended = 0;
  const empty = await exchange({ respond: (_req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Content-Length': 0 });
    res.end(() => ended++);
  } });
  assert.equal(empty.body.length, 0);
  assert.equal(ended, 1);
});
