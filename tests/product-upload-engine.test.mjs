import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HEADERS, parseProducts } from '../deploy/product-upload/model.mjs';
import { previewBatch, runBatch, requestId, photoIdentity, uploadPhoto } from '../deploy/product-upload/engine.mjs';
import { parseCreate, parseEdit, parseAddVariants, parseVariantEdit, parseStatus } from '../apps/api/src/admin/products/product-input.ts';

const BASE = '/api/admin/products';
const MAPPINGS = '/api/hidi/product-image-skus';
const copy = value => structuredClone(value);
const variant = (overrides = {}) => ({
  id: 'variant-1', sku: 'HIDI-EXISTING-M', color: 'Sand', colorHex: '#ABC123', size: 'M',
  pricePaise: 99900, mrpPaise: 149900, weightGrams: 650, active: true,
  bustMm: 960, waistMm: 920, hipMm: 1100, shoulderMm: 380, sleeveLengthMm: 460, garmentLengthMm: 1120,
  images: [{ id: 'old-photo', url: 'https://media.invalid/products/existing/front.webp', alt: 'Existing front' }],
  inventory: { onHand: 7, reserved: 2, available: 5, safetyStock: 0, reorderLevel: 5 }, ...overrides,
});
const product = (id = 'p1', overrides = {}) => ({
  id, skn: '12345', name: 'Existing Kurta', slug: 'existing-kurta', status: 'DRAFT',
  updatedAt: '2026-10-12T00:00:00.000Z', categoryId: 'casual', shortDescription: 'Original short',
  description: 'Original description', fabric: 'Silk', care: 'Dry clean',
  collections: [{ collectionId: 'retain' }, { collectionId: 'everyday' }],
  images: [], variants: [variant()], ...overrides,
});
const newRow = overrides => ({ action: 'NEW', product_key: 'new-kurta', product_name: 'New Kurta', color: 'Sand', size: 'M', selling_price: '999', mrp: '1499', ...overrides });
const updateRow = overrides => ({ action: 'UPDATE', product_key: 'existing', product_id: 'p1', ...overrides });
function groups(rows) { return parseProducts([{ name: 'Products', rows: [HEADERS, ...rows.map(row => HEADERS.map(h => row[h] ?? ''))] }]).groups; }
const photo = (name = 'Front.jpg', type = 'image/jpeg', content = 'photo fixture') => new File([content], name, { type });

function fixture(initial = [], hooks = {}) {
  const state = new Map(initial.map(p => [p.id, copy(p)]));
  const calls = [], bindings = [];
  let ticks = 0, variantNumber = 20;
  const bump = p => { p.updatedAt = new Date(Date.parse('2026-10-12T00:00:01.000Z') + ++ticks * 1000).toISOString(); };
  const error = (message, status) => Object.assign(new Error(message), { status });
  const find = id => { if (!state.has(id)) throw error('Product not found', 404); return state.get(id); };
  const version = (p, body) => { if (body.expectedUpdatedAt !== p.updatedAt) throw error('Changed by another staff member', 409); };
  const api = async (path, method = 'GET', body) => {
    const call = { path, method, body: body === undefined ? undefined : copy(body) };
    calls.push(call);
    if (hooks.before) await hooks.before(call, state);
    let result;
    if (path === BASE + '/options' && method === 'GET') result = {
      categories: [{ id: 'casual', name: 'Casual Wear', slug: 'casual-wear' }, { id: 'work', name: 'Work Wear', slug: 'work-wear' }],
      collections: [{ id: 'retain', slug: 'retained-edit' }, { id: 'everyday', slug: 'everyday' }, { id: 'ananya', slug: 'ananyas-pick' }],
    };
    else if (path.startsWith(BASE + '?status=ALL&page=') && method === 'GET') result = { items: [...state.values()].map(p => ({ id: p.id, skn: p.skn, name: p.name, slug: p.slug, status: p.status, updatedAt: p.updatedAt })), total: state.size };
    else if (path === MAPPINGS && method === 'GET') result = { bindings: copy(bindings) };
    else if (path === MAPPINGS + '/preflight' && method === 'POST') result = { valid: true };
    else if (path === MAPPINGS && method === 'POST') {
      const p = find(body.productId); version(p, body);
      const existing = bindings.find(b => b.imageSku === body.imageSku);
      if (existing && (existing.productId !== p.id || existing.color !== body.color)) throw error('Mapping belongs to another product', 409);
      if (!existing) bindings.push({ imageSku: body.imageSku, productId: p.id, productSlug: p.slug, color: body.color });
      result = { saved: true };
    }
    else if (/^\/api\/admin\/inventory\/[^/]+\/images$/.test(path) && method === 'POST') {
      const variantId = decodeURIComponent(path.split('/')[4]);
      const p = [...state.values()].find(product => product.variants.some(v => v.id === variantId));
      assert.ok(p, 'image metadata request must target an existing variant');
      const source = p.variants.find(v => v.id === variantId);
      assert.equal(typeof body.url, 'string');
      assert.equal(body.isMain, undefined);
      const targets = body.applyToColor ? p.variants.filter(v => v.color === source.color) : [source];
      for (const v of targets) {
        const existing = v.images.find(image => image.url === body.url);
        if (existing) { existing.alt = body.alt; existing.storagePath = body.storagePath ?? null; }
        else v.images.push({ id: 'json-photo-' + v.id, url: body.url, alt: body.alt, storagePath: body.storagePath ?? null, position: v.images.length });
      }
      result = { id: source.id, sku: source.sku, images: source.images };
    }
    else if (path === BASE && method === 'POST') {
      const parsed = parseCreate(body);
      const id = 'pm_' + parsed.requestId.replaceAll('-', '');
      if (state.has(id)) throw error('Already created', 409);
      result = product(id, {
        name: parsed.name, slug: parsed.slug, skn: '23456', categoryId: parsed.categoryId,
        shortDescription: parsed.shortDescription, description: parsed.description, fabric: parsed.fabric, care: parsed.care,
        collections: parsed.collectionIds.map(collectionId => ({ collectionId })),
        variants: [variant({ id: 'created-v1', sku: 'HIDI-NEW-M', color: parsed.colors[0].name, colorHex: parsed.colors[0].hex, size: parsed.sizes[0], pricePaise: parsed.pricePaise, mrpPaise: parsed.mrpPaise, weightGrams: parsed.weightGrams, bustMm: null, waistMm: null, hipMm: null, shoulderMm: null, sleeveLengthMm: null, garmentLengthMm: null, images: [], inventory: { onHand: 0, reserved: 0, available: 0, safetyStock: 0, reorderLevel: 5 } })],
      });
      bump(result); state.set(id, result);
    }
    else {
      const parts = path.slice(BASE.length + 1).split('/');
      const p = find(decodeURIComponent(parts[0]));
      if (method === 'GET' && parts.length === 1) result = p;
      else if (method === 'POST' && parts[1] === 'status') {
        parseStatus(body); version(p, body); p.status = body.status; bump(p); result = p;
      }
      else if (method === 'PATCH' && parts.length === 1) {
        parseEdit(body); version(p, body);
        for (const key of ['name', 'categoryId', 'shortDescription', 'description', 'fabric', 'care']) p[key] = body[key];
        p.collections = body.collectionIds.map(collectionId => ({ collectionId })); bump(p); result = p;
      }
      else if (method === 'POST' && parts[1] === 'variants') {
        const parsed = parseAddVariants(body); version(p, body);
        const sibling = p.variants.find(v => v.color.toLowerCase() === parsed.colors[0].name.toLowerCase());
        const siblingPhotos = p.variants.find(v => v.color.toLowerCase() === parsed.colors[0].name.toLowerCase() && v.images.length)?.images || [];
        const addedId = 'added-v' + ++variantNumber;
        p.variants.push(variant({ id: addedId, sku: 'HIDI-ADDED-' + variantNumber, color: sibling?.color || parsed.colors[0].name, colorHex: sibling?.colorHex ?? parsed.colors[0].hex, size: parsed.sizes[0], pricePaise: parsed.pricePaise, mrpPaise: parsed.mrpPaise, weightGrams: parsed.weightGrams, bustMm: null, waistMm: null, hipMm: null, shoulderMm: null, sleeveLengthMm: null, garmentLengthMm: null, images: siblingPhotos.map((image, i) => ({ id: addedId + '-photo-' + i, url: image.url, alt: image.alt, position: image.position ?? 0, storagePath: null })), inventory: { onHand: 0, reserved: 0, available: 0, safetyStock: 0, reorderLevel: 5 } }));
        bump(p); result = p;
      }
      else if (method === 'PATCH' && parts[1] === 'variants' && parts[2]) {
        parseVariantEdit(body); version(p, body);
        const v = p.variants.find(v => v.id === decodeURIComponent(parts[2]));
        assert.ok(v, 'variant PATCH must target an existing variant');
        for (const [key, value] of Object.entries(body)) if (key !== 'expectedUpdatedAt') v[key] = value;
        bump(p); result = p;
      }
      else throw new Error('Unexpected request: ' + method + ' ' + path);
    }
    if (hooks.after) await hooks.after(call, state, result);
    return copy(result);
  };
  return {
    api, calls, state, bindings, bump,
    writes: () => calls.filter(c => c.method !== 'GET' && !c.path.endsWith('/preflight')),
    attach(item, url = 'https://media.invalid/products/upload/' + item.name) {
      const p = find(item.productId);
      for (const id of item.targetVariantIds) {
        const v = p.variants.find(v => v.id === id); assert.ok(v);
        // The deployed API appends new URLs and updates existing URL metadata.
        // It ignores isMain and never changes gallery order during this request.
        const existing = v.images.find(image => image.url === url);
        if (existing) existing.alt = item.alt;
        else v.images.push({ id: 'upload-' + item.name, url, alt: item.alt, position: v.images.length, storagePath: null });
      }
      // Existing image endpoints update image rows, not Product.updatedAt.
      return { confirmed: true, url };
    },
  };
}

test('preview reads catalogue/options and never creates products, stock or image mappings', async () => {
  const f = fixture([product()]);
  const preview = await previewBatch(groups([updateRow({ fabric: 'Cotton' })]), [], f.api);
  assert.equal(preview.passed, true);
  assert.equal(preview.groups[0].record.id, 'p1');
  assert.deepEqual(f.writes(), []);
  assert.ok(f.calls.every(call => call.method === 'GET'));
});

test('failed preview cannot make any API request during save or publication', async () => {
  const calls = [];
  await assert.rejects(runBatch({ passed: false, errors: ['Missing photo'], groups: [] }, { intent: 'publish', api: async (...args) => calls.push(args) }), /Fix every preview error/i);
  assert.deepEqual(calls, []);
});

test('UPDATE identity conflicts and archived products block preview without writes', async () => {
  const first = product();
  const second = product('p2', { skn: '54321', slug: 'other-kurta', name: 'Other Kurta' });
  const f = fixture([first, second]);
  const conflict = await previewBatch(groups([updateRow({ skn: '54321' })]), [], f.api);
  assert.equal(conflict.passed, false);
  assert.match(conflict.errors.join('\n'), /different products/i);
  f.state.get('p1').status = 'ARCHIVED';
  const archived = await previewBatch(groups([updateRow()]), [], f.api);
  assert.equal(archived.passed, false);
  assert.match(archived.errors.join('\n'), /Archived or deleted/i);
  assert.deepEqual(f.writes(), []);
});

test('catalogue pagination inconsistency fails rather than risking an incomplete identity lookup', async () => {
  const f = fixture([product()], { before(call) { if (call.path.includes('?status=ALL')) throw new Error('Catalogue changed while loading.'); } });
  await assert.rejects(previewBatch(groups([updateRow()]), [], f.api), /Catalogue changed/i);
  assert.deepEqual(f.writes(), []);
});

test('selected files require exact names, allowed types, valid size and one unambiguous association', async () => {
  const row = newRow({ image_sku: 'KUR_001', photo_names: 'Front.jpg' });
  for (const files of [[], [photo('front.jpg')], [photo('Front.jpg', 'image/png')], [{ name: 'Front.jpg', type: 'image/jpeg', size: Number.MAX_SAFE_INTEGER + 1 }], [photo(), photo('FRONT.JPG')], [photo(), photo('Unused.jpg')]]) {
    const f = fixture();
    const preview = await previewBatch(groups([row]), files, f.api);
    assert.equal(preview.passed, false);
    assert.ok(preview.errors.length);
    assert.deepEqual(f.writes(), []);
  }
  const f = fixture();
  const shared = await previewBatch(groups([row, newRow({ product_key: 'other', product_name: 'Other Kurta', image_sku: 'KUR_002', photo_names: 'Front.jpg' })]), [photo()], f.api);
  assert.equal(shared.passed, false);
  assert.match(shared.errors.join('\n'), /different products or colours/i);
});

test('existing image mappings cannot be reassigned to another product or colour', async () => {
  const f = fixture();
  f.bindings.push({ imageSku: 'KUR_001', productId: 'unrelated', productSlug: 'other', color: 'Ivory' });
  const preview = await previewBatch(groups([newRow({ image_sku: 'KUR_001', photo_names: 'Front.jpg' })]), [photo()], f.api);
  assert.equal(preview.passed, false);
  assert.match(preview.errors.join('\n'), /belongs to another product or colour/i);
  assert.deepEqual(f.writes(), []);
});

test('saving ACTIVE metadata as Draft hides it first and retains URLs, SKU IDs, images and quantities', async () => {
  const original = product('p1', { status: 'ACTIVE' });
  const f = fixture([original]);
  const preview = await previewBatch(groups([updateRow({ fabric: 'Cotton' })]), [], f.api);
  assert.equal(preview.passed, true);
  assert.match(preview.groups[0].plan, /Draft/i);
  const report = await runBatch(preview, { intent: 'draft', api: f.api });
  assert.equal(report.drafted, 1);
  const saved = f.state.get('p1');
  assert.equal(saved.status, 'DRAFT');
  assert.equal(saved.fabric, 'Cotton');
  for (const field of ['slug', 'care', 'shortDescription', 'description', 'categoryId', 'variants', 'images']) assert.deepEqual(saved[field], original[field]);
  assert.deepEqual(saved.collections.map(c => c.collectionId).sort(), original.collections.map(c => c.collectionId).sort());
  assert.deepEqual(f.writes().map(c => [c.method, c.path]), [['POST', BASE + '/p1/status'], ['PATCH', BASE + '/p1']]);
  const metadataWrite = f.writes()[1].body;
  assert.equal(metadataWrite.slug, undefined);
  for (const call of f.writes()) for (const key of ['stock', 'onHand', 'quantity', 'inventory']) assert.equal(call.body[key], undefined);
});

test('variant updates send complete API-safe fields and retain omitted measurements, weight and active state', async () => {
  const original = product('p1', { variants: [variant({ active: false })] });
  const f = fixture([original]);
  const preview = await previewBatch(groups([updateRow({ color: 'Sand', size: 'M', selling_price: '1099' })]), [], f.api);
  assert.equal(preview.passed, true);
  const report = await runBatch(preview, { intent: 'draft', api: f.api });
  assert.equal(report.drafted, 1);
  const saved = f.state.get('p1').variants[0];
  assert.equal(saved.pricePaise, 109900);
  for (const key of ['mrpPaise', 'weightGrams', 'active', 'bustMm', 'waistMm', 'hipMm', 'shoulderMm', 'sleeveLengthMm', 'garmentLengthMm', 'id', 'sku', 'images', 'inventory']) assert.deepEqual(saved[key], original.variants[0][key]);
  assert.equal(f.writes().length, 1);
  assert.equal(f.writes()[0].method, 'PATCH');
  assert.doesNotThrow(() => parseVariantEdit(f.writes()[0].body));
});

test('new products and additional sizes remain zero stock without any inventory increment request', async () => {
  const f = fixture();
  const preview = await previewBatch(groups([newRow({ bust_mm: '960', weight_grams: '650' }), newRow({ size: 'L', selling_price: '1099', bust_mm: '1020', weight_grams: '700' })]), [], f.api);
  assert.equal(preview.passed, true);
  const report = await runBatch(preview, { intent: 'draft', api: f.api });
  assert.equal(report.drafted, 1);
  const saved = [...f.state.values()][0];
  assert.equal(saved.status, 'DRAFT');
  assert.equal(saved.variants.length, 2);
  assert.deepEqual(saved.variants.map(v => v.inventory.onHand), [0, 0]);
  assert.equal(saved.variants.find(v => v.size === 'L').bustMm, 1020);
  assert.equal(saved.variants.find(v => v.size === 'L').weightGrams, 700);
  assert.ok(!f.calls.some(call => /inventory.*(?:receive|adjust|stock)/i.test(call.path)));
});

test('publication waits for details, variants and verified photos on every intended size', async () => {
  const f = fixture();
  const rows = [newRow({ image_sku: 'KUR_001', photo_names: 'Side.webp;Front.jpg', main_photo: 'Front.jpg', photo_alt: 'New Kurta catalogue' }), newRow({ size: 'L' })];
  const preview = await previewBatch(groups(rows), [photo(), photo('Side.webp', 'image/webp')], f.api);
  assert.equal(preview.passed, true);
  const uploads = [];
  const report = await runBatch(preview, { intent: 'publish', api: f.api, upload: async item => {
    uploads.push(item);
    assert.equal(f.state.get(item.productId).status, 'DRAFT');
    assert.equal(item.targetVariantIds.length, 2);
    assert.equal(item.alt, 'New Kurta catalogue');
    return f.attach(item);
  } });
  assert.equal(report.published, 1);
  assert.equal(uploads.length, 2);
  assert.equal(uploads[0].name, 'Front.jpg');
  assert.equal(uploads[0].isMain, true);
  assert.equal(uploads[1].isMain, false);
  const saved = [...f.state.values()][0];
  assert.equal(saved.status, 'ACTIVE');
  assert.ok(saved.variants.every(v => v.images.length === 2 && v.images[0].url.endsWith('Front.jpg') && v.images[0].position === 0));
  assert.equal(f.writes().at(-1).body.status, 'ACTIVE');
});

test('a failed photo upload leaves Draft and cannot send ACTIVE even after earlier steps succeed', async () => {
  const f = fixture();
  const preview = await previewBatch(groups([newRow({ image_sku: 'KUR_001', photo_names: 'Front.jpg' })]), [photo()], f.api);
  const report = await runBatch(preview, { intent: 'publish', api: f.api, upload: async () => { throw new Error('Storage upload interrupted'); } });
  assert.equal(report.failed, 1);
  assert.equal(report.published, 0);
  assert.equal([...f.state.values()][0].status, 'DRAFT');
  assert.ok(!f.writes().some(call => call.body?.status === 'ACTIVE'));
});

test('an uploader success claim without attachments to every intended size never publishes', async () => {
  const f = fixture();
  const preview = await previewBatch(groups([newRow({ image_sku: 'KUR_001', photo_names: 'Front.jpg' }), newRow({ size: 'L' })]), [photo()], f.api);
  const report = await runBatch(preview, { intent: 'publish', api: f.api, upload: async item => {
    const p = f.state.get(item.productId); p.variants[0].images = [{ url: 'https://media.invalid/partial.jpg' }];
    return { confirmed: true, url: 'https://media.invalid/partial.jpg' };
  } });
  assert.equal(report.failed, 1);
  assert.match(report.results[0].message, /every size/i);
  assert.ok(!f.writes().some(call => call.body?.status === 'ACTIVE'));
});

test('Drafts without active sizes or usable photos remain Draft when publish is requested', async () => {
  for (const overrides of [{ variants: [variant({ active: false })] }, { variants: [variant({ images: [] })] }]) {
    const f = fixture([product('p1', overrides)]);
    const preview = await previewBatch(groups([updateRow()]), [], f.api);
    const report = await runBatch(preview, { intent: 'publish', api: f.api });
    assert.equal(report.failed, 1);
    assert.equal(report.published, 0);
    assert.equal(f.state.get('p1').status, 'DRAFT');
    assert.ok(!f.writes().some(call => call.body?.status === 'ACTIVE'));
  }
});

test('an entire stale batch is checked freshly before any product or mapping write', async () => {
  const f = fixture([product('p1', { status: 'ACTIVE' }), product('p2', { name: 'Other Kurta', skn: '54321', slug: 'other-kurta' })]);
  const preview = await previewBatch(groups([updateRow({ fabric: 'Cotton' }), updateRow({ product_key: 'other', product_id: 'p2', care: 'Hand wash' })]), [], f.api);
  assert.equal(preview.passed, true);
  f.bump(f.state.get('p2'));
  let report, failure;
  try { report = await runBatch(preview, { intent: 'draft', api: f.api }); } catch (error) { failure = error; }
  assert.deepEqual(f.writes(), []);
  assert.ok(failure || report?.failed > 0);
  assert.equal(f.state.get('p1').status, 'ACTIVE');
  assert.equal(f.state.get('p1').fabric, 'Silk');
});

test('a stale single product version is blocked without overwriting another staff change', async () => {
  const f = fixture([product()]);
  const preview = await previewBatch(groups([updateRow({ fabric: 'Cotton' })]), [], f.api);
  f.state.get('p1').care = 'Another staff edit'; f.bump(f.state.get('p1'));
  let report, failure;
  try { report = await runBatch(preview, { intent: 'draft', api: f.api }); } catch (error) { failure = error; }
  assert.deepEqual(f.writes(), []);
  assert.ok(failure || report?.failed > 0);
  assert.equal(f.state.get('p1').care, 'Another staff edit');
});

test('permission failure stops the batch before any later product is touched', async () => {
  const f = fixture([product(), product('p2', { skn: '54321', slug: 'other-kurta' })], { before(call) {
    if (call.method === 'PATCH') throw Object.assign(new Error('Catalogue permission required'), { status: 403 });
  } });
  const preview = await previewBatch(groups([updateRow({ fabric: 'Cotton' }), updateRow({ product_key: 'other', product_id: 'p2', fabric: 'Linen' })]), [], f.api);
  const report = await runBatch(preview, { intent: 'draft', api: f.api });
  assert.equal(report.stopped, true);
  assert.equal(report.failed, 1);
  assert.equal(report.results.length, 1);
  assert.equal(f.state.get('p2').fabric, 'Silk');
  assert.ok(!f.writes().some(call => call.path.includes('/p2')));
});

test('a lost successful create response is reconciled without another create or duplicate stock', async () => {
  let lost = false;
  const f = fixture([], { after(call) {
    if (call.path === BASE && call.method === 'POST' && !lost) { lost = true; throw new Error('Connection interrupted after create'); }
  } });
  const preview = await previewBatch(groups([newRow()]), [], f.api);
  const report = await runBatch(preview, { intent: 'draft', api: f.api });
  assert.equal(report.drafted, 1);
  assert.equal(f.state.size, 1);
  assert.equal(f.writes().filter(call => call.path === BASE && call.method === 'POST').length, 1);
  const again = await runBatch(preview, { intent: 'draft', api: f.api });
  assert.equal(again.drafted, 1);
  assert.equal(f.writes().filter(call => call.path === BASE && call.method === 'POST').length, 1);
});

test('a lost successful ACTIVE response is reconciled and a repeated publish does not rewrite status', async () => {
  let lost = false;
  const f = fixture([product()], { after(call) {
    if (call.body?.status === 'ACTIVE' && !lost) { lost = true; throw new Error('Connection interrupted after publication'); }
  } });
  const preview = await previewBatch(groups([updateRow()]), [], f.api);
  const report = await runBatch(preview, { intent: 'publish', api: f.api });
  assert.equal(report.published, 1);
  assert.equal(f.state.get('p1').status, 'ACTIVE');
  const again = await runBatch(preview, { intent: 'publish', api: f.api });
  assert.equal(again.published, 1);
  assert.equal(f.writes().filter(call => call.body?.status === 'ACTIVE').length, 1);
});

test('retry creation IDs and photo identities are stable and distinguish changed approved content', async () => {
  const payload = { key: 'new-kurta', name: 'New Kurta', slug: 'new-kurta' };
  const id = await requestId(payload);
  assert.match(id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.equal(await requestId(copy(payload)), id);
  assert.notEqual(await requestId({ ...payload, name: 'Changed Kurta' }), id);
  const item = { imageSku: 'KUR_001', sequence: 1, file: photo() };
  const identity = await photoIdentity(item);
  assert.match(identity.suffix, /^\/batch-[0-9a-f]{64}\.jpg$/);
  assert.deepEqual(await photoIdentity({ ...item, file: photo('Renamed.jpg') }), identity);
  assert.notEqual((await photoIdentity({ ...item, file: photo('Front.jpg', 'image/jpeg', 'changed bytes') })).key, identity.key);
  assert.notEqual((await photoIdentity({ ...item, imageSku: 'KUR_002' })).key, identity.key);
});

test('previously attached content on all colour sizes avoids another binary upload', async t => {
  const item = { imageSku: 'KUR_001', sequence: 1, file: photo(), productId: 'p1', variantId: 'variant-1', targetVariantIds: ['variant-1', 'variant-2'], color: 'Sand', isMain: false, alt: 'Front' };
  const identity = await photoIdentity(item);
  const url = 'https://media.invalid/products/p1' + identity.suffix;
  const f = fixture([product('p1', { variants: [variant({ images: [{ url, alt: item.alt }] }), variant({ id: 'variant-2', size: 'L', images: [{ url, alt: item.alt }] })] })]);
  let fetches = 0; t.mock.method(globalThis, 'fetch', async () => { fetches++; throw new Error('Binary upload should not run'); });
  const saved = await uploadPhoto(item, f.api);
  assert.equal(saved.confirmed, true);
  assert.equal(saved.skipped, true);
  assert.equal(saved.url, url);
  assert.equal(fetches, 0);
  assert.deepEqual(f.writes(), []);
});

test('binary uploads send authenticated colour sharing, main-photo and alt fields and reconcile a lost response', async t => {
  const item = { imageSku: 'KUR_001', sequence: 1, file: photo(), productId: 'p1', variantId: 'variant-1', targetVariantIds: ['variant-1', 'variant-2'], color: 'Sand', isMain: true, alt: 'Catalogue front' };
  const identity = await photoIdentity(item);
  const url = 'https://media.invalid/products/p1' + identity.suffix;
  const f = fixture([product('p1', { variants: [variant({ images: [] }), variant({ id: 'variant-2', size: 'L', images: [] })] })]);
  let uploads = 0;
  t.mock.method(globalThis, 'fetch', async (path, init) => {
    uploads++;
    assert.equal(path, '/api/admin/inventory/variant-1/images');
    assert.equal(init.method, 'POST');
    assert.equal(init.credentials, 'same-origin');
    assert.ok(init.signal instanceof AbortSignal);
    for (const [key, value] of Object.entries({ imageSku: 'KUR_001', photoNumber: '1', applyToColor: 'true', alt: 'Catalogue front' })) assert.equal(init.body.get(key), value);
    assert.equal(init.body.get('file').name, 'Front.jpg');
    f.attach(item, url);
    throw new Error('Connection interrupted after upload');
  });
  const saved = await uploadPhoto(item, f.api);
  assert.equal(saved.confirmed, true);
  assert.equal(saved.url, url);
  assert.equal(uploads, 1);
  assert.ok(f.state.get('p1').variants.every(v => v.images[0].url === url));
});

test('changed colour size targets fail before a binary upload', async t => {
  const f = fixture([product()]);
  let uploads = 0; t.mock.method(globalThis, 'fetch', async () => { uploads++; });
  await assert.rejects(uploadPhoto({ imageSku: 'KUR_001', sequence: 1, file: photo(), productId: 'p1', variantId: 'variant-1', targetVariantIds: ['variant-1', 'missing-variant'], color: 'Sand', isMain: false, alt: 'Front' }, f.api), /sizes changed/i);
  assert.equal(uploads, 0);
  assert.deepEqual(f.writes(), []);
});

test('Image SKU filenames can auto-match numbered photos and honour the marked main photo', async () => {
  const f = fixture();
  const preview = await previewBatch(groups([newRow({ image_sku: 'KUR_001' }), newRow({ size: 'L' })]), [photo('KUR_001_007_main.webp', 'image/webp'), photo('KUR_001_001.jpg')], f.api);
  assert.equal(preview.passed, true);
  const plan = preview.groups[0].photoPlans[0];
  assert.deepEqual(plan.items.map(item => [item.name, item.sequence, item.isMain]).sort((a, b) => a[1] - b[1]), [['KUR_001_001.jpg', 1, false], ['KUR_001_007_main.webp', 7, true]]);
  assert.equal(plan.mainPhoto, 'KUR_001_007_main.webp');
  const uploadOrder = [];
  const report = await runBatch(preview, { intent: 'publish', api: f.api, upload: async item => { uploadOrder.push([item.name, item.sequence]); return f.attach(item); } });
  assert.equal(report.published, 1);
  assert.deepEqual(uploadOrder, [['KUR_001_007_main.webp', 7], ['KUR_001_001.jpg', 1]]);
  assert.ok([...f.state.values()][0].variants.every(v => v.images[0].url === 'https://media.invalid/products/upload/KUR_001_007_main.webp' && v.images[0].position === 0));
});

test('automatic filenames block duplicate photo numbers, two marked mains and misleading extra files', async () => {
  for (const files of [
    [photo('KUR_001_001.jpg'), photo('KUR_001_001.webp', 'image/webp')],
    [photo('KUR_001_001_main.jpg'), photo('KUR_001_002_main.jpg')],
    [photo('KUR_001_0000.jpg')],
    [photo('KUR_001_10000.jpg')],
    [photo('KUR_001_front.jpg')],
  ]) {
    const f = fixture();
    const preview = await previewBatch(groups([newRow({ image_sku: 'KUR_001' })]), files, f.api);
    assert.equal(preview.passed, false);
    assert.ok(preview.errors.length);
    assert.deepEqual(f.writes(), []);
  }
  const f = fixture();
  const preview = await previewBatch(groups([newRow({ image_sku: 'KUR_001', main_photo: 'KUR_001_001.jpg' })]), [photo('KUR_001_001.jpg'), photo('KUR_001_002_main.jpg')], f.api);
  assert.equal(preview.passed, false);
  assert.match(preview.errors.join('\n'), /conflicts/i);
});

test('new variant labels cannot collide with existing colour or size SKU tokens', async () => {
  for (const [existing, row] of [
    [variant({ color: 'Blue-Grey' }), updateRow({ color: 'Blue Grey', size: 'L', selling_price: '999', mrp: '1499' })],
    [variant({ size: 'L+' }), updateRow({ color: 'Sand', size: 'L-', selling_price: '999', mrp: '1499' })],
  ]) {
    const f = fixture([product('p1', { variants: [existing] })]);
    const preview = await previewBatch(groups([row]), [], f.api);
    assert.equal(preview.passed, false);
    assert.match(preview.errors.join('\n'), /collides with an existing generated SKU token/i);
    assert.deepEqual(f.writes(), []);
  }
});

test('partial UPDATE prices are checked against retained counterpart prices before any write', async () => {
  const f = fixture([product()]);
  const preview = await previewBatch(groups([updateRow({ color: 'Sand', size: 'M', selling_price: '1599' })]), [], f.api);
  assert.equal(preview.passed, false);
  assert.match(preview.errors.join('\n'), /selling price and MRP/i);
  assert.deepEqual(f.writes(), []);
});

test('a new-upload retry can resume its own Draft but cannot silently unpublish its ACTIVE product', async () => {
  const f = fixture();
  const rows = [newRow()];
  const preview = await previewBatch(groups(rows), [], f.api);
  await runBatch(preview, { intent: 'draft', api: f.api });
  const resumed = await previewBatch(groups(rows), [], f.api);
  assert.equal(resumed.passed, true);
  assert.ok(resumed.groups[0].warnings.some(message => /resume/i.test(message)));
  const saved = [...f.state.values()][0]; saved.status = 'ACTIVE'; f.bump(saved);
  const publishedRetry = await previewBatch(groups(rows), [], f.api);
  assert.equal(publishedRetry.passed, false);
  assert.match(publishedRetry.errors.join('\n'), /already published.*UPDATE/i);
});

test('a lost metadata response followed by a failed read reconciles exactly on retry without duplicate PATCH', async () => {
  let lost = false, failedRead = false;
  const f = fixture([product()], {
    before(call) {
      if (lost && !failedRead && call.path === BASE + '/p1' && call.method === 'GET') { failedRead = true; throw new Error('Read also interrupted'); }
    },
    after(call) {
      if (call.method === 'PATCH' && call.path === BASE + '/p1' && !lost) { lost = true; throw new Error('Save response interrupted'); }
    },
  });
  const preview = await previewBatch(groups([updateRow({ fabric: 'Cotton' })]), [], f.api);
  const first = await runBatch(preview, { intent: 'draft', api: f.api });
  assert.equal(first.failed, 1);
  assert.equal(f.state.get('p1').fabric, 'Cotton');
  assert.ok(preview.groups[0].execution.pendingWrite);
  const retried = await runBatch(preview, { intent: 'draft', api: f.api });
  assert.equal(retried.drafted, 1);
  assert.equal(f.writes().filter(call => call.method === 'PATCH').length, 1);
});

test('a pending lost response cannot absorb another staff metadata change during retry', async () => {
  let lost = false, failedRead = false;
  const f = fixture([product()], {
    before(call) {
      if (lost && !failedRead && call.path === BASE + '/p1' && call.method === 'GET') { failedRead = true; throw new Error('Read also interrupted'); }
    },
    after(call) {
      if (call.method === 'PATCH' && !lost) { lost = true; throw new Error('Save response interrupted'); }
    },
  });
  const preview = await previewBatch(groups([updateRow({ fabric: 'Cotton' })]), [], f.api);
  assert.equal((await runBatch(preview, { intent: 'draft', api: f.api })).failed, 1);
  f.state.get('p1').care = 'Independent edit'; f.bump(f.state.get('p1'));
  await assert.rejects(runBatch(preview, { intent: 'draft', api: f.api }), /changed after preview/i);
  assert.equal(f.writes().filter(call => call.method === 'PATCH').length, 1);
  assert.equal(f.state.get('p1').care, 'Independent edit');
});

test('an explicit main photo already behind another cover is refused before any binary upload', async t => {
  const item = { imageSku: 'KUR_001', sequence: 1, file: photo(), productId: 'p1', variantId: 'variant-1', targetVariantIds: ['variant-1', 'variant-2'], color: 'Sand', isMain: true, alt: 'Correct catalogue front' };
  const identity = await photoIdentity(item), url = 'https://media.invalid/products/p1' + identity.suffix;
  const f = fixture([product('p1', { variants: [variant({ images: [{ url: 'https://media.invalid/old-main.jpg' }, { url, alt: 'Old alt' }] }), variant({ id: 'variant-2', size: 'L', images: [{ url: 'https://media.invalid/old-main.jpg' }, { url, alt: 'Old alt' }] })] })]);
  const before = copy(f.state.get('p1').variants);
  let uploads = 0;
  t.mock.method(globalThis, 'fetch', async () => { uploads++; throw new Error('Cover promotion must be blocked before upload'); });
  await assert.rejects(uploadPhoto(item, f.api), /main|cover/i);
  assert.equal(uploads, 0);
  assert.deepEqual(f.state.get('p1').variants, before);
});

test('photo upload stops on a concurrently published product and never treats it as a successful Draft', async t => {
  const item = { imageSku: 'KUR_001', sequence: 1, file: photo(), productId: 'p1', variantId: 'variant-1', targetVariantIds: ['variant-1'], color: 'Sand', isMain: true, alt: 'Front' };
  const identity = await photoIdentity(item);
  const f = fixture([product('p1', { variants: [variant({ images: [] })] })]);
  t.mock.method(globalThis, 'fetch', async () => {
    f.attach(item, 'https://media.invalid/products/p1' + identity.suffix);
    f.state.get('p1').status = 'ACTIVE';
    return { ok: true, json: async () => ({}) };
  });
  await assert.rejects(uploadPhoto(item, f.api), /published during the upload/i);
  assert.deepEqual(f.writes(), []);
});

test('a disappearing existing photo blocks publication after upload instead of replacing the gallery', async () => {
  const f = fixture([product()]);
  const preview = await previewBatch(groups([updateRow({ color: 'Sand', size: 'M', image_sku: 'KUR_001', photo_names: 'Front.jpg' })]), [photo()], f.api);
  assert.equal(preview.passed, true);
  const report = await runBatch(preview, { intent: 'publish', api: f.api, upload: async item => {
    f.state.get(item.productId).variants[0].images = [];
    return f.attach(item);
  } });
  assert.equal(report.failed, 1);
  assert.match(report.results[0].message, /existing colour photo disappeared/i);
  assert.ok(!f.writes().some(call => call.body?.status === 'ACTIVE'));
});

test('cancellation after a completed product preserves it and does not start the next product', async () => {
  const f = fixture([product(), product('p2', { skn: '54321', slug: 'other-kurta' })]);
  const preview = await previewBatch(groups([updateRow({ fabric: 'Cotton' }), updateRow({ product_key: 'other', product_id: 'p2', fabric: 'Linen' })]), [], f.api);
  let stop = false;
  const report = await runBatch(preview, { intent: 'draft', api: f.api, shouldStop: () => stop, onProgress(event) { if (event.result?.state === 'draft') stop = true; } });
  assert.equal(report.stopped, true);
  assert.equal(report.drafted, 1);
  assert.equal(f.state.get('p1').fabric, 'Cotton');
  assert.equal(f.state.get('p2').fabric, 'Silk');
  assert.ok(!f.writes().some(call => call.path.includes('/p2')));
});

test('lost Draft-status recovery cannot absorb and overwrite an independent blank-care edit', async () => {
  let interrupted = false;
  let f;
  f = fixture([product('p1', { status: 'ACTIVE' })], { after(call, state) {
    if (call.body?.status === 'DRAFT' && !interrupted) {
      interrupted = true;
      const p = state.get('p1'); p.care = 'Independent hand-wash instruction'; f.bump(p);
      throw new Error('Draft response interrupted');
    }
  } });
  const preview = await previewBatch(groups([updateRow({ fabric: 'Cotton' })]), [], f.api);
  assert.equal(preview.passed, true);
  const report = await runBatch(preview, { intent: 'draft', api: f.api });
  assert.equal(report.failed, 1);
  assert.equal(report.drafted, 0);
  assert.equal(f.state.get('p1').status, 'DRAFT');
  assert.equal(f.state.get('p1').care, 'Independent hand-wash instruction');
  assert.equal(f.state.get('p1').fabric, 'Silk');
  assert.ok(!f.writes().some(call => call.method === 'PATCH'));
});

test('lost variant-write recovery cannot overwrite a concurrent blank measurement on another size', async () => {
  let interrupted = false;
  let f;
  f = fixture([product('p1', { variants: [variant(), variant({ id: 'variant-2', sku: 'HIDI-EXISTING-L', size: 'L', bustMm: 1020 })] })], { after(call, state) {
    if (call.method === 'PATCH' && call.path.endsWith('/variants/variant-1') && !interrupted) {
      interrupted = true;
      const p = state.get('p1'); p.variants.find(v => v.id === 'variant-2').bustMm = 1150; f.bump(p);
      throw new Error('Variant response interrupted');
    }
  } });
  const preview = await previewBatch(groups([updateRow({ color: 'Sand', size: 'M', selling_price: '1099' }), updateRow({ color: 'Sand', size: 'L', selling_price: '1199' })]), [], f.api);
  assert.equal(preview.passed, true);
  const report = await runBatch(preview, { intent: 'draft', api: f.api });
  assert.equal(report.failed, 1);
  assert.equal(report.drafted, 0);
  const otherSize = f.state.get('p1').variants.find(v => v.id === 'variant-2');
  assert.equal(otherSize.bustMm, 1150);
  assert.equal(otherSize.pricePaise, 99900);
  assert.ok(!f.writes().some(call => call.path.endsWith('/variants/variant-2')));
});

test('a normal successful variant response with unrelated mutation also stops before a follow-on overwrite', async () => {
  let changed = false;
  let f;
  f = fixture([product('p1', { variants: [variant(), variant({ id: 'variant-2', sku: 'HIDI-EXISTING-L', size: 'L', shoulderMm: 400 })] })], { after(call, state) {
    if (call.method === 'PATCH' && call.path.endsWith('/variants/variant-1') && !changed) {
      changed = true;
      const p = state.get('p1'); p.variants.find(v => v.id === 'variant-2').shoulderMm = 440; f.bump(p);
    }
  } });
  const preview = await previewBatch(groups([updateRow({ color: 'Sand', size: 'M', selling_price: '1099' }), updateRow({ color: 'Sand', size: 'L', selling_price: '1199' })]), [], f.api);
  assert.equal(preview.passed, true);
  const report = await runBatch(preview, { intent: 'draft', api: f.api });
  assert.equal(report.failed, 1);
  assert.equal(report.drafted, 0);
  assert.equal(f.state.get('p1').variants.find(v => v.id === 'variant-2').shoulderMm, 440);
  assert.ok(!f.writes().some(call => call.path.endsWith('/variants/variant-2')));
});

test('a lost Draft-status response with protected details unchanged can safely finish the approved metadata save', async () => {
  let interrupted = false;
  const f = fixture([product('p1', { status: 'ACTIVE' })], { after(call) {
    if (call.body?.status === 'DRAFT' && !interrupted) { interrupted = true; throw new Error('Draft response interrupted'); }
  } });
  const preview = await previewBatch(groups([updateRow({ fabric: 'Cotton' })]), [], f.api);
  const report = await runBatch(preview, { intent: 'draft', api: f.api });
  assert.equal(report.drafted, 1);
  assert.equal(report.failed, 0);
  assert.equal(f.state.get('p1').care, 'Dry clean');
  assert.equal(f.state.get('p1').fabric, 'Cotton');
  assert.equal(f.writes().filter(call => call.body?.status === 'DRAFT').length, 1);
});

test('a lost added-size response reconciles its zero stock and inherited colour gallery without another add', async () => {
  let interrupted = false;
  const original = product();
  const f = fixture([original], { after(call) {
    if (call.method === 'POST' && call.path.endsWith('/variants') && !interrupted) { interrupted = true; throw new Error('Added-size response interrupted'); }
  } });
  const preview = await previewBatch(groups([updateRow({ color: 'sand', size: 'L', selling_price: '1099', mrp: '1499' })]), [], f.api);
  assert.equal(preview.passed, true);
  const report = await runBatch(preview, { intent: 'draft', api: f.api });
  assert.equal(report.drafted, 1);
  const saved = f.state.get('p1');
  const added = saved.variants.find(v => v.size === 'L');
  assert.equal(added.color, 'Sand');
  assert.equal(added.colorHex, '#ABC123');
  assert.deepEqual(added.inventory, { onHand: 0, reserved: 0, available: 0, safetyStock: 0, reorderLevel: 5 });
  assert.deepEqual(added.images.map(p => [p.url, p.alt]), original.variants[0].images.map(p => [p.url, p.alt]));
  assert.notEqual(added.images[0].id, original.variants[0].images[0].id);
  assert.deepEqual(saved.variants.find(v => v.id === 'variant-1'), original.variants[0]);
  assert.equal(f.writes().filter(call => call.method === 'POST' && call.path.endsWith('/variants')).length, 1);
});

test('explicit retry after a corrected permission failure clears the stale authentication status', async () => {
  let denied = true;
  const f = fixture([product()], { before(call) {
    if (denied && call.method === 'PATCH') throw Object.assign(new Error('Catalogue permission required'), { status: 403 });
  } });
  const preview = await previewBatch(groups([updateRow({ fabric: 'Cotton' })]), [], f.api);
  const failed = await runBatch(preview, { intent: 'draft', api: f.api });
  assert.equal(failed.failed, 1);
  assert.equal(failed.stopped, true);
  assert.equal(preview.groups[0].execution.status, 403);
  assert.equal(f.state.get('p1').fabric, 'Silk');
  denied = false;
  const resumed = await runBatch(preview, { intent: 'draft', api: f.api });
  assert.equal(resumed.drafted, 1);
  assert.equal(resumed.failed, 0);
  assert.equal(resumed.stopped, false);
  assert.equal(f.state.get('p1').fabric, 'Cotton');
  assert.equal(preview.groups[0].execution.state, 'draft');
  assert.equal(preview.groups[0].execution.status, undefined);
});

test('UPDATE uploads append photos and preserve the existing cover on every colour size', async () => {
  const original = product('p1', { variants: [variant(), variant({ id: 'variant-2', sku: 'HIDI-EXISTING-L', size: 'L' })] });
  const f = fixture([original]);
  const preview = await previewBatch(groups([updateRow({ color: 'Sand', size: 'M', image_sku: 'KUR_001', photo_names: 'Front.jpg;Side.webp' })]), [photo(), photo('Side.webp', 'image/webp')], f.api);
  assert.equal(preview.passed, true);
  const uploads = [];
  const report = await runBatch(preview, { intent: 'draft', api: f.api, upload: async item => { uploads.push(item); return f.attach(item); } });
  assert.equal(report.drafted, 1);
  assert.ok(uploads.every(item => !item.isMain));
  for (const v of f.state.get('p1').variants) {
    const old = original.variants.find(previous => previous.id === v.id).images[0];
    assert.deepEqual(v.images[0], old);
    assert.deepEqual(v.images.map(image => image.url), [old.url, 'https://media.invalid/products/upload/Front.jpg', 'https://media.invalid/products/upload/Side.webp']);
  }
});

test('UPDATE explicit main-photo promotion is rejected at preview before any product or mapping write', async () => {
  for (const status of ['DRAFT', 'ACTIVE']) {
    const f = fixture([product('p1', { status })]);
    const preview = await previewBatch(groups([updateRow({ color: 'Sand', size: 'M', image_sku: 'KUR_001', photo_names: 'Front.jpg', main_photo: 'Front.jpg' })]), [photo()], f.api);
    assert.equal(preview.passed, false);
    assert.match(preview.errors.join('\n'), /main|cover/i);
    assert.deepEqual(f.writes(), []);
    assert.equal(f.state.get('p1').status, status);
  }
});

test('an existing matching cover on all sizes permits JSON alt refresh without binary upload or gallery changes', async t => {
  const file = photo(), imageSku = 'KUR_001';
  const identity = await photoIdentity({ imageSku, sequence: 1, file });
  const cover = { id: 'existing-cover', url: 'https://media.invalid/products/p1' + identity.suffix, alt: 'Old catalogue alt', position: 0, storagePath: 'products/p1/cover.jpg' };
  const detail = { id: 'existing-detail', url: 'https://media.invalid/products/p1/detail.jpg', alt: 'Detail', position: 1, storagePath: 'products/p1/detail.jpg' };
  const f = fixture([product('p1', { variants: [variant({ images: [copy(cover), copy(detail)] }), variant({ id: 'variant-2', sku: 'HIDI-EXISTING-L', size: 'L', images: [{ ...cover, id: 'cover-l' }, { ...detail, id: 'detail-l' }] })] })]);
  const before = copy(f.state.get('p1').variants.map(v => v.images));
  const preview = await previewBatch(groups([updateRow({ color: 'Sand', size: 'M', image_sku: imageSku, photo_names: 'Front.jpg', main_photo: 'Front.jpg', photo_alt: 'Correct catalogue front' })]), [file], f.api);
  assert.equal(preview.passed, true);
  let binaryUploads = 0;
  t.mock.method(globalThis, 'fetch', async () => { binaryUploads++; throw new Error('Existing cover metadata must not upload another binary'); });
  const report = await runBatch(preview, { intent: 'draft', api: f.api });
  assert.equal(report.drafted, 1);
  assert.equal(binaryUploads, 0);
  const photoMetadata = f.writes().filter(call => call.path.startsWith('/api/admin/inventory/'));
  assert.equal(photoMetadata.length, 1);
  assert.deepEqual(photoMetadata[0].body, { url: cover.url, storagePath: cover.storagePath, alt: 'Correct catalogue front', applyToColor: true });
  f.state.get('p1').variants.forEach((v, index) => {
    assert.deepEqual(v.images.map(p => [p.id, p.url, p.position, p.storagePath]), before[index].map(p => [p.id, p.url, p.position, p.storagePath]));
    assert.equal(v.images[0].alt, 'Correct catalogue front');
    assert.deepEqual(v.images[1], before[index][1]);
  });
  assert.ok(!f.calls.some(call => call.method === 'DELETE'));
});

test('cover matching on only one size is insufficient for an UPDATE main-photo request', async () => {
  const file = photo(), identity = await photoIdentity({ imageSku: 'KUR_001', sequence: 1, file });
  const url = 'https://media.invalid/products/p1' + identity.suffix;
  const f = fixture([product('p1', { variants: [variant({ images: [{ id: 'cover-m', url, alt: 'Old alt', position: 0 }] }), variant({ id: 'variant-2', size: 'L', images: [{ id: 'old-l', url: 'https://media.invalid/other-cover.jpg', position: 0 }, { id: 'cover-l', url, alt: 'Old alt', position: 1 }] })] })]);
  const preview = await previewBatch(groups([updateRow({ color: 'Sand', size: 'M', image_sku: 'KUR_001', photo_names: 'Front.jpg', main_photo: 'Front.jpg' })]), [file], f.api);
  assert.equal(preview.passed, false);
  assert.match(preview.errors.join('\n'), /main|cover/i);
  assert.deepEqual(f.writes(), []);
});

test('a NEW upload can resume its own Draft when the selected main content already covers every size', async t => {
  const f = fixture();
  const rows = [newRow({ image_sku: 'KUR_001', photo_names: 'Side.webp;Front.jpg', main_photo: 'Front.jpg' }), newRow({ size: 'L' })];
  const files = [photo('Side.webp', 'image/webp'), photo()];
  const firstPreview = await previewBatch(groups(rows), files, f.api);
  assert.equal(firstPreview.passed, true);
  const firstReport = await runBatch(firstPreview, { intent: 'draft', api: f.api, upload: async item => {
    const identity = await photoIdentity(item);
    return f.attach(item, 'https://media.invalid/products/' + item.productId + identity.suffix);
  } });
  assert.equal(firstReport.drafted, 1);
  const before = copy([...f.state.values()][0]);
  const secondPreview = await previewBatch(groups(rows), files, f.api);
  assert.equal(secondPreview.passed, true);
  let binaryUploads = 0;
  t.mock.method(globalThis, 'fetch', async () => { binaryUploads++; throw new Error('Matching saved content should not upload twice'); });
  const resumed = await runBatch(secondPreview, { intent: 'draft', api: f.api });
  assert.equal(resumed.drafted, 1);
  assert.equal(resumed.failed, 0);
  assert.equal(binaryUploads, 0);
  assert.equal(f.state.size, 1);
  assert.deepEqual([...f.state.values()][0].variants, before.variants);
  assert.equal(f.writes().filter(call => call.method === 'POST' && call.path === BASE).length, 1);
});

test('cover alt refresh after an earlier-sorting size is added retains the original target object URL', async t => {
  const file = photo(), imageSku = 'KUR_001';
  const identity = await photoIdentity({ imageSku, sequence: 1, file });
  const url = 'https://media.invalid/products/p1/z-original' + identity.suffix;
  const f = fixture([product('p1', { variants: [
    variant({ id: 'z-original', images: [{ id: 'original-cover-id', url, alt: 'Old alt', position: 0, storagePath: 'products/p1/z-original' + identity.suffix }] }),
    variant({ id: 'a-added', sku: 'HIDI-NEW-L', size: 'L', images: [{ id: 'inherited-cover-id', url, alt: 'Old alt', position: 0, storagePath: null }] }),
  ] })]);
  const before = copy(f.state.get('p1').variants);
  const item = { imageSku, sequence: 1, file, productId: 'p1', variantId: 'a-added', targetVariantIds: ['a-added', 'z-original'], color: 'Sand', isMain: true, alt: 'Updated catalogue front' };
  let binaryUploads = 0;
  t.mock.method(globalThis, 'fetch', async () => { binaryUploads++; throw new Error('A different source variant must not create another object'); });
  const saved = await uploadPhoto(item, f.api);
  assert.equal(saved.confirmed, true);
  assert.equal(saved.url, url);
  assert.equal(binaryUploads, 0);
  const photoMetadata = f.writes().filter(call => call.path.startsWith('/api/admin/inventory/'));
  assert.equal(photoMetadata.length, 1);
  assert.equal(photoMetadata[0].path, '/api/admin/inventory/a-added/images');
  assert.equal(photoMetadata[0].body.url, url);
  assert.equal(photoMetadata[0].body.isMain, undefined);
  f.state.get('p1').variants.forEach((v, index) => {
    assert.equal(v.images.length, 1);
    assert.equal(v.images[0].id, before[index].images[0].id);
    assert.equal(v.images[0].url, before[index].images[0].url);
    assert.equal(v.images[0].position, 0);
    assert.equal(v.images[0].alt, 'Updated catalogue front');
    assert.deepEqual(v.inventory, before[index].inventory);
  });
});

test('a lost successful JSON photo metadata response is confirmed without another binary or metadata write', async t => {
  const file = photo(), imageSku = 'KUR_001';
  const identity = await photoIdentity({ imageSku, sequence: 1, file });
  const url = 'https://media.invalid/products/p1/variant-1' + identity.suffix;
  let lost = false;
  const f = fixture([product('p1', { variants: [variant({ images: [{ id: 'cover-m', url, alt: 'Old alt', position: 0 }] }), variant({ id: 'variant-2', size: 'L', images: [{ id: 'cover-l', url, alt: 'Old alt', position: 0 }] })] })], { after(call) {
    if (call.method === 'POST' && call.path.startsWith('/api/admin/inventory/') && !lost) { lost = true; throw new Error('Photo metadata response interrupted'); }
  } });
  const item = { imageSku, sequence: 1, file, productId: 'p1', variantId: 'variant-1', targetVariantIds: ['variant-1', 'variant-2'], color: 'Sand', isMain: true, alt: 'Correct front alt' };
  let binaryUploads = 0;
  t.mock.method(globalThis, 'fetch', async () => { binaryUploads++; throw new Error('Saved photo metadata cannot require a binary retry'); });
  const saved = await uploadPhoto(item, f.api);
  assert.equal(saved.confirmed, true);
  assert.equal(saved.url, url);
  assert.equal(binaryUploads, 0);
  assert.equal(f.writes().filter(call => call.path.startsWith('/api/admin/inventory/')).length, 1);
  assert.ok(f.state.get('p1').variants.every(v => v.images.length === 1 && v.images[0].url === url && v.images[0].alt === 'Correct front alt' && v.images[0].position === 0));
  const retried = await uploadPhoto(item, f.api);
  assert.equal(retried.skipped, true);
  assert.equal(binaryUploads, 0);
  assert.equal(f.writes().filter(call => call.path.startsWith('/api/admin/inventory/')).length, 1);
});

test('a later cover change without a product revision invalidates the entire batch before any POST or PATCH', async () => {
  for (const intent of ['draft', 'publish']) {
    const file = photo(), imageSku = 'KUR_002';
    const identity = await photoIdentity({ imageSku, sequence: 1, file });
    const oldCoverUrl = 'https://media.invalid/products/p2/original' + identity.suffix;
    const f = fixture([
      product('p1', { status: 'ACTIVE' }),
      product('p2', { skn: '54321', slug: 'other-kurta', name: 'Other Kurta', variants: [
        variant({ id: 'p2-m', images: [{ id: 'old-cover-m', url: oldCoverUrl, alt: 'Original cover', position: 0 }] }),
        variant({ id: 'p2-l', sku: 'HIDI-OTHER-L', size: 'L', images: [{ id: 'old-cover-l', url: oldCoverUrl, alt: 'Original cover', position: 0 }] }),
      ] }),
    ]);
    const preview = await previewBatch(groups([
      updateRow({ fabric: 'Cotton' }),
      updateRow({ product_key: 'other', product_id: 'p2', color: 'Sand', size: 'M', image_sku: imageSku, photo_names: 'Front.jpg', main_photo: 'Front.jpg' }),
    ]), [file], f.api);
    assert.equal(preview.passed, true);
    const revision = f.state.get('p2').updatedAt;
    for (const v of f.state.get('p2').variants) {
      v.images = [{ id: 'new-cover-' + v.id, url: 'https://media.invalid/products/p2/new-cover.jpg', alt: 'Changed cover', position: 0 }, ...v.images.map(image => ({ ...image, position: 1 }))];
    }
    // Photo API updates image rows without changing Product.updatedAt.
    assert.equal(f.state.get('p2').updatedAt, revision);
    f.calls.length = 0;
    await assert.rejects(runBatch(preview, { intent, api: f.api }), /main|cover/i);
    assert.ok(f.calls.length > 0);
    assert.ok(f.calls.every(call => call.method === 'GET'), 'the entire fresh cover check must precede mapping preflight and every write');
    assert.deepEqual(f.writes(), []);
    assert.equal(f.state.get('p1').status, 'ACTIVE');
    assert.equal(f.state.get('p1').fabric, 'Silk');
    assert.ok(f.state.get('p2').variants.every(v => v.images[0].url.endsWith('new-cover.jpg') && v.images[1].url === oldCoverUrl));
  }
});
