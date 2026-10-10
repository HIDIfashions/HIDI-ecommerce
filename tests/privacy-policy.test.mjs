import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { createPrivacyPolicyHandler, validateDraft, publicationProblems, renderPolicy } from '../deploy/privacy-policy/handler.mjs';
import { initialDraft } from '../deploy/privacy-policy/defaults.mjs';
import { privacyFixture } from './privacy-policy-fixture.mjs';

test('draft defaults carry the approved business name and require completion', () => {
  const draft = initialDraft();
  assert.equal(draft.businessName, 'High D Higher Dimensions');
  assert.equal(draft.address, '');
  assert.equal(draft.officerEmail, '');
  assert.ok(publicationProblems(draft).length >= 7);
  assert.throws(() => validateDraft({ ...draft, sections: [] }), /sections/);
  assert.throws(() => validateDraft({ ...draft, sections: [{ title: 'A', text: 'X'.repeat(12001) }] }), /limits/);
});

test('stored policy text and substitutions are escaped, with no active markup', () => {
  const draft = initialDraft(); draft.businessName = '<script>alert(1)</script>'; draft.sections = [{ title: '<img onerror=alert(1)>', text: '{{businessName}}\n\n<a href="javascript:evil">test</a>' }];
  const html = renderPolicy(draft, { preview: true });
  assert.ok(html.includes('&lt;script&gt;'));
  assert.ok(!html.includes('<script>'));
  assert.ok(!html.includes('<img'));
  assert.ok(html.includes('noindex,nofollow'));
});

test('owner-only durable draft, CSRF, version history and publication boundaries', async t => {
  const fixture = await privacyFixture(); t.after(fixture.close);
  const get = async (path, role = 'OWNER') => fetch(fixture.url + path, { headers: role ? { cookie: `fixture_role=${role}` } : {} });
  const write = async (body, extra = {}) => fetch(fixture.url + '/api/hidi/privacy-policy/admin', { method: 'POST', headers: { cookie: 'fixture_role=OWNER', origin: fixture.url, 'content-type': 'application/json', ...extra }, body: JSON.stringify(body) });
  const api = '/api/hidi/privacy-policy/admin';
  for (const role of [null, 'SUPPORT', 'CATALOG', 'OPERATIONS']) {
    const response = await get(api, role); assert.equal(response.status, role ? 403 : 401); assert.ok(!(await response.text()).includes('High D'));
  }
  assert.equal((await get(api + '/preview', null)).status, 401);
  assert.equal((await get('/privacy', null)).status, 404);
  assert.deepEqual(await (await get('/api/hidi/privacy-policy', null)).json(), { published: false });
  let state = await (await get(api)).json(); assert.equal(state.draft.businessName, 'High D Higher Dimensions');
  assert.equal((await write({ action: 'save', draft: state.draft, etag: null }, { origin: 'https://evil.example' })).status, 403);
  assert.equal((await write({ action: 'save', draft: state.draft, etag: null }, { 'sec-fetch-site': 'cross-site' })).status, 403);
  assert.equal((await write({ action: 'save', draft: state.draft, etag: null }, { 'content-type': 'text/plain' })).status, 415);
  assert.equal((await write({ action: 'publish', etag: state.etag, approved: true })).status, 422);
  state = await (await write({ action: 'save', draft: state.draft, etag: state.etag })).json();
  assert.equal(state.etag, '"2"');
  assert.equal((await write({ action: 'save', draft: state.draft, etag: null })).status, 409);
  assert.equal((await get('/privacy', null)).status, 404);
  const preview = await get(api + '/preview'); assert.equal(preview.status, 200); assert.ok((await preview.text()).includes('ADMIN PREVIEW'));
  const draft = { ...state.draft, address: '123 Test Road, Hyderabad, Telangana, India 500001', officerName: 'Test Officer, Grievance Officer', officerEmail: 'privacy@hidi.test', officerPhone: '+91 9000000000', effectiveDate: '2026-01-01', sections: [{ title: 'Privacy', text: '{{businessName}} uses account details to provide requested services. Contact {{officerEmail}}. Records are retained for service and applicable legal obligations.' }] };
  state = await (await write({ action: 'save', draft, etag: state.etag })).json(); assert.deepEqual(state.problems, []);
  assert.equal((await write({ action: 'publish', etag: state.etag })).status, 400);
  state = await (await write({ action: 'publish', etag: state.etag, approved: true })).json();
  assert.equal(state.published.version, 1); assert.equal(state.history.length, 1); assert.equal(fixture.archives.size, 1);
  let publicPage = await get('/privacy', null); assert.equal(publicPage.status, 200); assert.ok((await publicPage.text()).includes('Version 1'));
  assert.equal((await get(api + '/preview?version=' + state.history[0].id)).status, 200);
  assert.equal((await get(api + '/preview?version=bad')).status, 404);
  state = await (await write({ action: 'save', draft: { ...draft, businessName: 'Unpublished replacement' }, etag: state.etag })).json();
  const unchanged = await (await get('/privacy', null)).text(); assert.ok(unchanged.includes('High D Higher Dimensions')); assert.ok(!unchanged.includes('Unpublished replacement'));
  fixture.rejectSave = true;
  assert.equal((await write({ action: 'publish', etag: state.etag, approved: true })).status, 409);
  publicPage = await (await get('/privacy', null)).text(); assert.ok(publicPage.includes('Version 1')); assert.ok(!publicPage.includes('Unpublished replacement'));
  fixture.rejectSave = false;
  state = await (await write({ action: 'publish', etag: state.etag, approved: true })).json(); assert.equal(state.published.version, 2);
  assert.equal(state.history.length, 2);
  assert.ok((await (await get(api + '/preview?version=' + state.history[1].id)).text()).includes('High D Higher Dimensions'));
});
