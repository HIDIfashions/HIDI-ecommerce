import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import test from 'node:test';
import {crawlerDocument} from './probes.mjs';

async function withServer(handler, run) {
  const server = createServer(handler);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    return await run(`http://127.0.0.1:${server.address().port}`);
  } finally {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
}

test('crawler document waits for the complete HTML stream and sends canonical crawler headers', async () => {
  await withServer((request, response) => {
    assert.equal(request.headers.host, 'hidiindia.com');
    assert.equal(request.headers['x-forwarded-host'], 'hidiindia.com');
    assert.equal(request.headers['x-forwarded-proto'], 'https');
    assert.equal(request.headers.accept, 'text/html,application/xhtml+xml');
    assert.equal(request.headers['accept-encoding'], 'identity');
    response.writeHead(200, {'content-type': 'text/html; charset=utf-8'});
    response.write('<!doctype html><html><body>first');
    setTimeout(() => response.end(' second</body></html>'), 40);
  }, async base => {
    const started = Date.now();
    const document = await crawlerDocument(base, '/streamed', {timeoutMs: 500, limit: 1024});
    assert.equal(document.status, 200);
    assert.match(document.headers.get('content-type'), /^text\/html\b/i);
    assert.equal(document.text, '<!doctype html><html><body>first second</body></html>');
    assert(Date.now() - started >= 30, 'reader must not resolve before the response end event');
  });
});

test('crawler document enforces the response-size cap', async () => {
  await withServer((_request, response) => {
    response.writeHead(200, {'content-type': 'text/html', 'content-length': '1024'});
    response.end('oversized');
  }, async base => {
    await assert.rejects(
      crawlerDocument(base, '/oversized', {timeoutMs: 500, limit: 64}),
      /Crawler document \/oversized rejected after \d+ms: declared body exceeds 64 bytes/,
    );
  });
});

test('crawler document has an absolute deadline even when the server keeps sending bytes', async () => {
  await withServer((_request, response) => {
    response.writeHead(200, {'content-type': 'text/html'});
    const interval = setInterval(() => response.write('x'), 10);
    response.once('close', () => clearInterval(interval));
  }, async base => {
    await assert.rejects(
      crawlerDocument(base, '/never-ending', {timeoutMs: 80, limit: 1024}),
      /Crawler document \/never-ending timed out after \d+ms: request exceeded 80ms/,
    );
  });
});
