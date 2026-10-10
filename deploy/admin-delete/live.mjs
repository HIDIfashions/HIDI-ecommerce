// Anonymous probes only: no staff cookie and no real product identifier.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
const base = 'https://thidigk.thehidi.com';
const endpoint = base + '/api/hidi/product-deletion/HIDI-NONEXISTENT-RELEASE-PROBE';
let checks = 0;
for (const method of ['GET', 'DELETE']) {
  const response = await fetch(endpoint, { method, headers: method === 'DELETE' ? { 'content-type': 'application/json', origin: base } : {}, body: method === 'DELETE' ? JSON.stringify({ confirmName: 'HIDI-NONEXISTENT-RELEASE-PROBE', expectedUpdatedAt: '2026-10-10T00:00:00.000Z' }) : undefined, signal: AbortSignal.timeout(30000) });
  assert.equal(response.status, 401, 'Anonymous deletion endpoint must reject ' + method);
  checks++;
}
const page = await fetch(base + '/admin/product-delete', { signal: AbortSignal.timeout(30000) });
assert.equal(page.status, 200); assert.match(page.headers.get('x-robots-tag') || '', /noindex/);
assert.match(await page.text(), /product-delete\.mjs/); checks += 3;
const malformed = await fetch(base + '/api/hidi/product-deletion/..%2Funsafe', { signal: AbortSignal.timeout(30000) });
assert.ok([400, 401, 404].includes(malformed.status), 'Malformed identifiers must not access upstream products'); checks++;
await mkdir('evidence/admin-delete', { recursive: true });
await writeFile('evidence/admin-delete/live-probes.json', JSON.stringify({ passed: true, checks, anonymousWritesDenied: true, realProductWrites: 0, blobWrites: 0 }, null, 2));
console.log('PASS: live deletion UI and anonymous boundaries verified; no product or storage changed');
