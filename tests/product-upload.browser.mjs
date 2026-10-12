/** Actual retained Web runtime, disposable catalogue and photo fixtures only.
 * No script replaces the uploader or its model: the downloaded XLSX is filled
 * with invented rows and submitted through the real file controls and APIs.
 */
import assert from 'node:assert/strict';
import { createServer, request as httpRequest } from 'node:http';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { inflateRawSync } from 'node:zlib';
import { HEADERS } from '../deploy/product-upload/model.mjs';
import { parseCreate, parseEdit, parseAddVariants, parseVariantEdit, parseStatus, makeSku } from '../apps/api/src/admin/products/product-input.ts';

const VIEWPORTS = [{ width: 320, height: 568 }, { width: 390, height: 844 }, { width: 844, height: 390 }, { width: 1440, height: 900 }];
const UPLOAD_PATH = '/admin/product-upload';
const REQUIRED_RETAINED_TOOLS = ['/admin/landing-media', '/admin/packing-scanner', '/admin/product-quick-fill', '/admin/product-bulk'];
const OLD_NATIVE_PATHS = ['/admin/products', '/admin/import', '/admin/products/price-tags', '/admin/inventory', '/admin/orders'];
const RETAINED_HYDRATION_ERROR = 'Minified React error #418; visit https://react.dev/errors/418?args[]=HTML&args[]= for the full message or use the non-minified dev environment for full errors and additional helpful warnings.';
const PHOTO_BYTES = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==', 'base64');
const clone = value => JSON.parse(JSON.stringify(value));
const bySlug = (state, slug) => [...state.records.values()].find(product => product.slug === slug);
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const sleep = ms => new Promise(done => setTimeout(done, ms));
const escapeXml = value => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const column = index => { let value = index + 1, result = ''; while (value) { const remainder = (value - 1) % 26; result = String.fromCharCode(65 + remainder) + result; value = Math.floor((value - 1) / 26); } return result; };

export function parseNavigationTools(source) {
  const table = source.match(/\bconst tools = \[([\s\S]*?)\n\s*\];/); assert(table, 'Retained navigation has its explicit tool table');
  const objects = [...table[1].matchAll(/\{\s*key:\s*'([^']+)',\s*label:\s*'([^']+)',\s*href:\s*'([^']+)',\s*icon:\s*'([^']*)',\s*marker:\s*'([^']+)'\s*\}/g)].map(([, key, label, href, icon, marker]) => ({ key, label, href, icon, marker }));
  assert(objects.length >= 4); assert.equal(new Set(objects.map(tool => tool.key)).size, objects.length, 'Tool keys are unique'); assert.equal(new Set(objects.map(tool => tool.href)).size, objects.length, 'Tool paths are unique');
  assert.equal((table[1].match(/\bkey:/g) || []).length, objects.length, 'Every retained tool row is parsed');
  return objects;
}
export async function runtimeNavigationContract(runtime = process.env.HIDI_CANDIDATE_RUNTIME) {
  assert(runtime, 'The freshly captured candidate and base runtimes are required for retained navigation verification'); const candidateRoot = resolve(runtime), baseRoot = join(dirname(candidateRoot), 'base-app');
  const baselineSource = await readFile(join(baseRoot, 'admin-tools/navigation.js'), 'utf8'), candidateSource = await readFile(join(candidateRoot, 'admin-tools/navigation.js'), 'utf8'), baselineTools = parseNavigationTools(baselineSource), candidateTools = parseNavigationTools(candidateSource);
  assert(!baselineTools.some(tool => tool.href === UPLOAD_PATH || tool.key === 'product-upload'), 'Fresh baseline cannot already contain the new uploader');
  for (const path of REQUIRED_RETAINED_TOOLS) assert.equal(baselineTools.filter(tool => tool.href === path).length, 1, 'Required existing Admin tool: ' + path);
  const additions = candidateTools.filter(tool => tool.key === 'product-upload'); assert.equal(additions.length, 1, 'Exactly one new Product Upload tab'); const addition = additions[0]; assert.equal(addition.label, 'Product Upload'); assert.equal(addition.href, UPLOAD_PATH); assert.equal(addition.marker, 'hidiProductUpload'); assert(addition.icon.length > 0);
  assert.equal(candidateTools.length, baselineTools.length + 1, 'Only one tool is added'); assert.deepEqual(candidateTools.filter(tool => tool.key !== 'product-upload'), baselineTools, 'Every original tool object and its order are retained exactly');
  return { baseRoot, candidateRoot, baselineTools, candidateTools, baselineNavigationSha256: hash(Buffer.from(baselineSource)), candidateNavigationSha256: hash(Buffer.from(candidateSource)) };
}

function zipEntries(bytes) {
  let end = -1;
  for (let at = bytes.length - 22; at >= Math.max(0, bytes.length - 65557); at--) if (bytes.readUInt32LE(at) === 0x06054b50 && at + 22 + bytes.readUInt16LE(at + 20) === bytes.length) { end = at; break; }
  assert(end >= 0, 'Downloaded template is a genuine ZIP workbook');
  const entries = new Map(); let at = bytes.readUInt32LE(end + 16);
  for (let index = 0; index < bytes.readUInt16LE(end + 10); index++) {
    assert.equal(bytes.readUInt32LE(at), 0x02014b50);
    const method = bytes.readUInt16LE(at + 10), length = bytes.readUInt32LE(at + 20), size = bytes.readUInt32LE(at + 24), nameLength = bytes.readUInt16LE(at + 28), extra = bytes.readUInt16LE(at + 30), comment = bytes.readUInt16LE(at + 32), offset = bytes.readUInt32LE(at + 42);
    const name = bytes.subarray(at + 46, at + 46 + nameLength).toString('utf8');
    assert.equal(bytes.readUInt32LE(offset), 0x04034b50);
    const start = offset + 30 + bytes.readUInt16LE(offset + 26) + bytes.readUInt16LE(offset + 28), compressed = bytes.subarray(start, start + length);
    assert([0, 8].includes(method)); const data = method === 8 ? inflateRawSync(compressed) : compressed; assert.equal(data.length, size);
    entries.set(name, data); at += 46 + nameLength + extra + comment;
  }
  return entries;
}
function crc32(bytes) { let crc = 0xffffffff; for (const byte of bytes) { crc ^= byte; for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1)); } return (crc ^ 0xffffffff) >>> 0; }
function zipStored(entries) {
  const local = [], central = []; let offset = 0;
  for (const [name, data] of entries) {
    const filename = Buffer.from(name), header = Buffer.alloc(30), directory = Buffer.alloc(46), checksum = crc32(data);
    header.writeUInt32LE(0x04034b50); header.writeUInt16LE(20, 4); header.writeUInt32LE(checksum, 14); header.writeUInt32LE(data.length, 18); header.writeUInt32LE(data.length, 22); header.writeUInt16LE(filename.length, 26);
    directory.writeUInt32LE(0x02014b50); directory.writeUInt16LE(20, 4); directory.writeUInt16LE(20, 6); directory.writeUInt32LE(checksum, 16); directory.writeUInt32LE(data.length, 20); directory.writeUInt32LE(data.length, 24); directory.writeUInt16LE(filename.length, 28); directory.writeUInt32LE(offset, 42);
    local.push(header, filename, data); central.push(directory, filename); offset += header.length + filename.length + data.length;
  }
  const directory = Buffer.concat(central), end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50); end.writeUInt16LE(entries.size, 8); end.writeUInt16LE(entries.size, 10); end.writeUInt32LE(directory.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, directory, end]);
}
/** Change only first-sheet data in the real delivered workbook, retaining its
 * field guide, examples, styles, validation and relationships. Test data only.
 */
export function fillDownloadedTemplate(template, rows) {
  const entries = zipEntries(template), name = 'xl/worksheets/sheet1.xml'; assert(entries.has(name));
  const xml = entries.get(name).toString('utf8'), sheet = xml.match(/<(\w+:)?sheetData\b[^>]*>([\s\S]*?)<\/\1sheetData>/); assert(sheet, 'Products sheet data exists');
  const prefix = sheet[1] || '', first = sheet[2].match(new RegExp('<' + prefix + 'row\\b[^>]*\\br="1"[^>]*>[\\s\\S]*?<\\/' + prefix + 'row>')); assert(first, 'Real first row contains the supplied headings');
  const fixtureRows = rows.map((row, index) => '<' + prefix + 'row r="' + (index + 2) + '">' + HEADERS.map((heading, cell) => row[heading] === undefined || row[heading] === '' ? '' : '<' + prefix + 'c r="' + column(cell) + (index + 2) + '" t="inlineStr"><' + prefix + 'is><' + prefix + 't xml:space="preserve">' + escapeXml(row[heading]) + '</' + prefix + 't></' + prefix + 'is></' + prefix + 'c>').join('') + '</' + prefix + 'row>').join('');
  entries.set(name, Buffer.from(xml.replace(sheet[0], '<' + prefix + 'sheetData>' + first[0] + fixtureRows + '</' + prefix + 'sheetData>')));
  return zipStored(entries);
}

const OPTIONS = { categories: [{ id: 'casual', name: 'Casual Wear', slug: 'casual-wear' }, { id: 'work', name: 'Work Wear', slug: 'work-wear' }, { id: 'occasion', name: 'Occasional Wear', slug: 'occasional-wear' }], collections: [{ id: 'everyday', name: 'Everyday', slug: 'everyday' }, { id: 'ananya', name: 'Ananya’s Pick', slug: 'ananyas-pick' }] };
function oldProduct() {
  return { id: 'fixture-existing', skn: '54321', name: 'Fixture Existing Ivory Kurta', slug: 'fixture-existing-ivory', status: 'ACTIVE', updatedAt: '2026-10-12T00:00:00.000Z', categoryId: 'work', category: OPTIONS.categories[1], shortDescription: 'Preserve short description', description: 'Preserve full details\nIncludes: 1 kurta\nFit: Relaxed', fabric: 'Preserve cotton', care: 'Preserve care', collections: [{ collectionId: 'everyday', collection: OPTIONS.collections[0] }, { collectionId: 'ananya', collection: OPTIONS.collections[1] }], images: [{ id: 'old-product-photo', url: '/brand/hidi-logo-header.svg', alt: 'Existing cover', position: 0, isMain: true }], variants: ['M', 'L'].map((size, index) => ({ id: 'existing-' + size, sku: 'PRESERVE-SKU-' + size, color: 'Ivory', size, colorHex: '#F3EBDD', active: true, pricePaise: 179900 + index * 10000, mrpPaise: 229900 + index * 10000, weightGrams: 350 + index * 20, bustMm: 1000 + index * 50, waistMm: 920 + index * 50, hipMm: 1080 + index * 50, shoulderMm: 380 + index * 10, sleeveLengthMm: 450 + index * 10, garmentLengthMm: 1100 + index * 10, images: [{ id: 'old-' + size, url: '/brand/hidi-logo-header.svg', alt: 'Original ' + size, position: 0, isMain: true }], inventory: { onHand: 9 + index, reserved: 2, safetyStock: 3, reorderLevel: 7 } })) };
}
function newRows(key = 'fixture-cotton', override = {}) {
  return ['M', 'L', 'XL', 'XXL'].map((size, index) => ({ action: 'NEW', product_key: key, product_slug: key, product_name: 'Fixture Cotton Kurta', category: 'Casual Wear', collection_slugs: 'everyday', ananyas_pick: 'TRUE', short_description: 'An invented browser fixture.', description: 'Cotton kurta with side pockets.', fabric: 'Cotton', care: 'Gentle wash separately.', includes: '1 kurta', fit: 'Relaxed', lining: 'Unlined', model: 'Fixture wears M.', color: 'Ivory', color_hex: '#F3EBDD', size, selling_price: '1799', mrp: '2299', weight_grams: '350', active: 'TRUE', bust_mm: String(1000 + index * 50), waist_mm: String(920 + index * 50), hip_mm: String(1080 + index * 50), shoulder_mm: String(380 + index * 10), sleeve_length_mm: '450', garment_length_mm: '1100', image_sku: key.toUpperCase().replace(/-/g, '_'), photo_names: key.toUpperCase().replace(/-/g, '_') + '_1.png;' + key.toUpperCase().replace(/-/g, '_') + '_2.png', main_photo: key.toUpperCase().replace(/-/g, '_') + '_2.png', photo_alt: 'Ivory cotton kurta, photographed for the fixture.', ...override }));
}
const photoFiles = key => [2, 1].map(number => ({ name: key.toUpperCase().replace(/-/g, '_') + '_' + number + '.png', mimeType: 'image/png', buffer: PHOTO_BYTES }));

function fixtureState() {
  return { records: new Map(), bindings: [], calls: [], writes: [], photos: [], bad: [], sequence: 0, auth: 200, failPhoto: false, failPhotoNumber: null, expireOnPhotoNumber: null, losePhotoResponse: false, failVariant: false, deleted: [], published: [] };
}
function bump(state, product) { product.updatedAt = new Date(Date.UTC(2026, 9, 12, 0, 0, ++state.sequence)).toISOString(); }
function addVariant(product, color, size, body = {}) {
  const sibling = product.variants.find(variant => variant.color.toLowerCase() === color.toLowerCase());
  color = sibling?.color || color;
  const existing = product.variants.find(variant => variant.color === color && variant.size === size); assert(!existing, 'Each colour/size is created once');
  const variant = { id: product.id + '-' + color.toLowerCase().replace(/\W/g, '') + '-' + size, sku: makeSku(product.id, product.slug, color, size), color, size, colorHex: sibling?.colorHex ?? body.colorHex ?? null, active: body.active ?? true, pricePaise: body.pricePaise, mrpPaise: body.mrpPaise, weightGrams: body.weightGrams ?? null, bustMm: body.bustMm ?? null, waistMm: body.waistMm ?? null, hipMm: body.hipMm ?? null, shoulderMm: body.shoulderMm ?? null, sleeveLengthMm: body.sleeveLengthMm ?? null, garmentLengthMm: body.garmentLengthMm ?? null, images: [], inventory: { onHand: 0, reserved: 0, safetyStock: 0, reorderLevel: 5 } };
  const gallery = product.variants.find(value => value.color === color && value.images.length)?.images || [];
  variant.images = gallery.map((image, index) => ({ id: 'copied-' + variant.id + '-' + index, url: image.url, alt: image.alt, position: image.position, storagePath: null }));
  assert(Number.isInteger(variant.pricePaise) && variant.pricePaise > 0 && variant.pricePaise <= variant.mrpPaise, 'Actual endpoint receives validated paise pricing'); product.variants.push(variant); return variant;
}
async function fixtureApi(state, method, url, body = {}) {
  const path = url.pathname; state.calls.push({ method, path, body: clone(body) });
  if (path === '/api/admin/session') return { status: state.auth, body: state.auth === 200 ? { admin: { id: 'fixture-owner', displayName: 'Fixture Owner', email: 'fixture@example.invalid', role: 'OWNER', permissions: ['catalog:read', 'catalog:write'] } } : { message: state.auth === 401 ? 'Admin session expired. Sign in again.' : 'This staff account cannot manage products.' } };
  if (state.auth !== 200 && (path.startsWith('/api/admin/') || path.startsWith('/api/hidi/'))) return { status: state.auth, body: { message: 'Admin access required.' } };
  if (path === '/api/hidi/product-image-skus/preflight' && method === 'POST') { assert(Array.isArray(body.bindings)); return { body: { passed: true } }; }
  if (path === '/api/hidi/product-image-skus') {
    if (method === 'GET') return { body: { bindings: clone(state.bindings) } };
    if (method === 'POST') { const product = state.records.get(body.productId); assert(product); assert.equal(body.expectedUpdatedAt, product.updatedAt); assert(product.variants.some(variant => variant.color === body.color)); assert(!state.bindings.some(binding => binding.imageSku === body.imageSku && (binding.productId !== product.id || binding.color !== body.color))); const binding = { imageSku: body.imageSku, productId: product.id, productSlug: product.slug, color: body.color }; if (!state.bindings.some(previous => JSON.stringify(previous) === JSON.stringify(binding))) state.bindings.push(binding); state.writes.push({ method, path, body: clone(body) }); return { body: { saved: true, binding } }; }
  }
  if (path === '/api/admin/products/options' && method === 'GET') return { body: clone(OPTIONS) };
  if (path === '/api/admin/products') {
    if (method === 'GET') { const items = [...state.records.values()].filter(product => (!url.searchParams.get('q') || [product.slug, product.name, product.skn, product.id].some(value => value?.toLowerCase().includes(url.searchParams.get('q').toLowerCase()))) && (!['DRAFT', 'ACTIVE'].includes(url.searchParams.get('status')) || product.status === url.searchParams.get('status'))); return { body: { items: clone(items.map(product => ({ id: product.id, skn: product.skn, name: product.name, slug: product.slug, status: product.status, updatedAt: product.updatedAt, category: OPTIONS.categories.find(category => category.id === product.categoryId)?.name || null, variantCount: product.variants.length, onHand: product.variants.reduce((quantity, variant) => quantity + variant.inventory.onHand, 0), minPricePaise: Math.min(...product.variants.map(variant => variant.pricePaise)), imageUrl: product.images[0]?.url || product.variants.find(variant => variant.images.length)?.images[0]?.url || null }))), total: items.length, page: Number(url.searchParams.get('page') || 1), pageSize: 100 } }; }
    if (method === 'POST') { const validated = parseCreate(body); assert.equal(body.status, undefined, 'Create API rejects explicit publication fields'); assert.equal(body.colors.length, 1, 'Create only one deterministic first variant'); assert.equal(body.sizes.length, 1); assert(![...state.records.values()].some(product => product.slug === body.slug), 'Retries cannot create duplicate products'); const product = { id: 'pm_' + validated.requestId.replace(/-/g, ''), skn: String(12345 + state.records.size), name: body.name, slug: body.slug, status: 'DRAFT', categoryId: body.categoryId ?? null, category: clone(OPTIONS.categories.find(category => category.id === body.categoryId) || null), shortDescription: body.shortDescription ?? null, description: body.description ?? null, fabric: body.fabric ?? null, care: body.care ?? null, collections: (body.collectionIds || []).map(collectionId => ({ collectionId, collection: clone(OPTIONS.collections.find(collection => collection.id === collectionId)) })), images: [], variants: [], updatedAt: '' }; const color = typeof body.colors[0] === 'string' ? body.colors[0] : body.colors[0].name; addVariant(product, color, body.sizes[0], { ...body, colorHex: body.colors[0].hex ?? body.colorHex }); bump(state, product); state.records.set(product.id, product); state.writes.push({ method, path, body: clone(body) }); return { body: clone(product) }; }
  }
  const match = path.match(/^\/api\/admin\/products\/([^/]+)(?:\/(.*))?$/);
  if (match) {
    const product = state.records.get(decodeURIComponent(match[1])), tail = match[2] || ''; if (!product) return { status: 404, body: { message: 'Fixture product not found.' } };
    if (!tail && method === 'GET') return { body: clone(product) };
    if (tail === 'variants' && method === 'POST') { const validated = parseAddVariants(body); if (state.failVariant) { state.failVariant = false; return { status: 503, body: { message: 'Fixture variant temporarily unavailable.' } }; } assert.equal(body.expectedUpdatedAt, product.updatedAt); assert.equal(validated.colors.length, 1); assert.equal(validated.sizes.length, 1); addVariant(product, validated.colors[0].name, validated.sizes[0], { ...validated, colorHex: validated.colors[0].hex }); bump(state, product); state.writes.push({ method, path, body: clone(body) }); return { body: clone(product) }; }
    if (tail.startsWith('variants/') && method === 'PATCH') { parseVariantEdit(body); assert.equal(body.expectedUpdatedAt, product.updatedAt); const variant = product.variants.find(value => value.id === tail.slice(9)); assert(variant); assert.equal(body.sku, undefined, 'Existing SKU is preserved'); assert.equal(body.inventory, undefined, 'Stock is not part of variant updates'); for (const field of ['pricePaise', 'mrpPaise', 'weightGrams', 'active', 'bustMm', 'waistMm', 'hipMm', 'shoulderMm', 'sleeveLengthMm', 'garmentLengthMm']) if (field in body) variant[field] = body[field]; bump(state, product); state.writes.push({ method, path, body: clone(body) }); return { body: clone(product) }; }
    if (!tail && method === 'PATCH') { parseEdit(body); assert.equal(body.expectedUpdatedAt, product.updatedAt); assert.equal(body.slug, undefined, 'Existing URL is never renamed'); assert.equal(body.status, undefined, 'Publication uses explicit status endpoint'); for (const field of ['name', 'shortDescription', 'description', 'fabric', 'care', 'categoryId']) if (field in body) product[field] = body[field]; if (body.collectionIds) product.collections = body.collectionIds.map(collectionId => ({ collectionId, collection: clone(OPTIONS.collections.find(collection => collection.id === collectionId)) })); bump(state, product); state.writes.push({ method, path, body: clone(body) }); return { body: clone(product) }; }
    if (tail === 'status' && method === 'POST') { parseStatus(body); assert.equal(body.expectedUpdatedAt, product.updatedAt); assert(['DRAFT', 'ACTIVE'].includes(body.status)); if (body.status === 'ACTIVE') { assert(product.variants.length > 0); assert(product.variants.filter(variant => variant.active !== false).every(variant => variant.images.length), 'Publish follows successful photo attachment for every active size'); state.published.push(product.id); } product.status = body.status; bump(state, product); state.writes.push({ method, path, body: clone(body) }); return { body: clone(product) }; }
  }
  if (path === '/api/admin/inventory' && method === 'GET') return { body: { rows: [...state.records.values()].flatMap(product => product.variants.map(variant => ({ productId: product.id, productName: product.name, variantId: variant.id, sku: variant.sku, color: variant.color, size: variant.size, onHand: variant.inventory.onHand }))) } };
  if (path === '/api/admin/orders' && method === 'GET') return { body: { orders: [] } };
  if (path.startsWith('/api/hidi/product-deletion/') && method === 'GET') { const product = state.records.get(path.split('/').pop()); return { body: { ...clone(product), photoCount: product?.variants.reduce((n, variant) => n + variant.images.length, 0) || 0, pendingMediaCount: 0 } }; }
  state.bad.push(method + ' ' + path); return { status: 404, body: { message: 'Unexpected disposable fixture request.' } };
}
async function receivePhoto(state, request, response) {
  const chunks = []; let length = 0; for await (const chunk of request) { length += chunk.length; assert(length < 1024 * 1024, 'Synthetic photo request is bounded'); chunks.push(chunk); }
  const form = await new Response(Buffer.concat(chunks), { headers: { 'content-type': request.headers['content-type'] } }).formData(), variantId = request.url.split('/')[4];
  const product = [...state.records.values()].find(record => record.variants.some(variant => variant.id === variantId)); assert(product); const variant = product.variants.find(value => value.id === variantId);
  assert.equal(product.status, 'DRAFT', 'Details and photo stages run while product is hidden'); assert.equal(form.get('applyToColor'), 'true'); const file = form.get('file'); assert(file); const bytes = Buffer.from(await file.arrayBuffer()); assert(bytes.equals(PHOTO_BYTES), 'Real browser multipart retains every image byte');
  const number = Number(form.get('photoNumber')), imageSku = form.get('imageSku'), alt = form.get('alt'); assert(Number.isInteger(number) && number > 0); assert(alt && !alt.includes('sha256')); assert.equal(file.type, 'image/png');
  if (state.expireOnPhotoNumber === number) { state.expireOnPhotoNumber = null; state.auth = 401; response.writeHead(401, { 'content-type': 'application/json' }); response.end('{"message":"Fixture staff session expired."}'); return; }
  if (state.failPhoto || state.failPhotoNumber === number) { state.failPhoto = false; state.failPhotoNumber = null; response.writeHead(503, { 'content-type': 'application/json' }); response.end('{"message":"Fixture photo attachment temporarily unavailable."}'); return; }
  const key = hash(Buffer.from([imageSku, String(number), file.type, hash(bytes)].join('\u0000'))), url = '/media/products/variants/source/batch-' + key + '.png', targets = product.variants.filter(value => value.color === variant.color);
  assert(targets.length); assert(!targets.some(target => target.images.some(image => image.url === url)), 'Completed hashes are skipped rather than uploaded twice');
  for (const target of targets) target.images.push({ id: 'photo-' + state.photos.length + '-' + target.id, url, alt, position: target.images.length, isMain: form.get('isMain') === 'true' });
  if (form.get('isMain') === 'true') for (const target of targets) { const cover = target.images.find(image => image.url === url); target.images = [cover, ...target.images.filter(image => image !== cover)]; target.images.forEach((image, position) => { image.position = position; image.isMain = position === 0; }); }
  state.photos.push({ productId: product.id, variantId, targetIds: targets.map(value => value.id), imageSku, number, alt, isMain: form.get('isMain') === 'true', hash: hash(bytes) }); state.writes.push({ method: 'POST', path: '/api/admin/inventory/' + variantId + '/images' });
  response.writeHead(state.losePhotoResponse ? 503 : 200, { 'content-type': 'application/json' }); response.end(JSON.stringify(state.losePhotoResponse ? { message: 'Fixture lost successful photo response.' } : clone(variant))); state.losePhotoResponse = false;
}

async function listen(server) { await new Promise(done => server.listen(0, '127.0.0.1', done)); return server.address().port; }
async function close(server) { server.closeAllConnections(); await new Promise(done => server.close(done)); }
const ownedProcessGroups = new WeakSet();
async function stop(child) {
  if (!child) return;
  const signal = value => { if (ownedProcessGroups.has(child)) { try { process.kill(-child.pid, value); } catch (error) { if (error.code !== 'ESRCH') throw error; } } else if (child.exitCode === null) child.kill(value); };
  signal('SIGTERM'); if (child.exitCode === null) await new Promise(done => { child.once('exit', done); setTimeout(() => { signal('SIGKILL'); done(); }, 5000).unref(); });
  // Both disposable wrappers start their own Next child on the retained default
  // port. Kill only our own isolated group so no child can survive into the next run.
  signal('SIGKILL'); ownedProcessGroups.delete(child);
}

async function waitUntil(test, message, timeout = 20000) { const start = Date.now(); while (!test()) { assert(Date.now() - start < timeout, message); await sleep(50); } }
async function noOverflow(page) { const bounds = await page.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth })); assert(bounds.scroll <= bounds.width + 1, 'Product Upload fits the viewport: ' + JSON.stringify(bounds)); return Math.max(0, bounds.scroll - bounds.width); }
async function review(page, template, rows, files = [], folder = null) {
  await page.locator('#product-file').setInputFiles({ name: 'fictional-products.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: fillDownloadedTemplate(template, rows) });
  await page.locator('#photo-files').setInputFiles(files); if (folder) { await page.locator('#photo-folder').setInputFiles(folder); assert.equal(await page.locator('#photo-files').evaluate(input => input.files.length), 0, 'Folder replaces the previous image selection'); } await page.locator('#preview').click(); await page.locator('#review').waitFor(); await page.locator('#product-groups .product-card').first().waitFor();
  assert.equal(await page.locator('#batch-errors').isVisible(), false, 'Valid real-template fixture has no batch errors: ' + await page.locator('#batch-errors').textContent());
  await page.locator('#finish').waitFor(); await noOverflow(page);
}
async function finish(page, button) { await page.locator(button).click(); await page.locator('#report-box').waitFor(); await page.locator('#stop').waitFor({ state: 'hidden' }); await noOverflow(page); }
async function openTool(page, base) { await page.goto(base + '/admin/product-upload', { waitUntil: 'domcontentloaded' }); await page.locator('#upload-flow').waitFor(); await page.locator('#template').waitFor(); }

async function retainedAdminCheck(page, base, state, contract) {
  // Existing standalone tools retain their actual modules and controls; the
  // existing native importer and Products page are loaded rather than mocked.
  const writeCount = state.writes.length;
  await page.goto(base + '/admin/product-quick-fill', { waitUntil: 'domcontentloaded' }); await page.getByRole('heading', { name: 'Product Quick Fill', exact: true }).waitFor();
  await page.goto(base + '/admin/product-bulk', { waitUntil: 'domcontentloaded' }); await page.getByRole('heading', { name: 'Bulk Product Details', exact: true }).waitFor(); await page.locator('#preview').waitFor();
  if (contract.baselineTools.some(tool => tool.href === '/admin/product-photos')) { await page.goto(base + '/admin/product-photos', { waitUntil: 'domcontentloaded' }); await page.getByRole('heading', { name: /^(?:Photos by SKN|Photos by Image SKU)$/ }).waitFor(); }
  await page.goto(base + '/admin/packing-scanner', { waitUntil: 'domcontentloaded' }); await page.getByRole('heading', { name: 'Packing Scanner', exact: true }).waitFor(); await page.locator('#scan').waitFor({ state: 'attached' }); assert(await page.locator('#scan').isDisabled(), 'Scanner waits for a selected order'); assert(await page.locator('#workspace').isHidden(), 'Packing workspace remains hidden until an order is selected');
  const first = [...state.records.values()][0];
  await page.goto(base + '/admin/product-delete?product=' + first.id, { waitUntil: 'domcontentloaded' }); await page.getByRole('heading', { name: 'Delete product', exact: true }).waitFor(); await page.locator('#loading').waitFor({ state: 'hidden' }); assert(await page.locator('#deleteButton').isDisabled(), 'Delete retains explicit typed confirmation');
  await page.goto(base + '/admin/products', { waitUntil: 'domcontentloaded' });
  const navigation = page.locator('nav[aria-label="Admin navigation"]').first(); await navigation.locator('[data-hidi-admin-tool]').nth(contract.candidateTools.length - 1).waitFor({ state: 'attached' });
  const actualTools = await navigation.locator('[data-hidi-admin-tool]').evaluateAll((links, expected) => links.map((link, index) => ({ key: link.dataset.hidiAdminTool, label: link.querySelector('span').textContent, href: new URL(link.href).pathname, marker: link.dataset[expected[index]?.marker] })), contract.candidateTools); assert.equal(actualTools.length, contract.candidateTools.length, 'Exactly the original tabs plus one Product Upload tab'); assert.deepEqual(actualTools, contract.candidateTools.map(tool => ({ key: tool.key, label: tool.label, href: tool.href, marker: 'true' })), 'Ordered tool identities, labels, paths and original marker attributes are retained');
  for (const path of OLD_NATIVE_PATHS) assert.equal(await navigation.locator('a[href="' + path + '"]').count(), 1, 'Native link retained: ' + path);
  await page.locator('[data-hidi-product-delete]').first().waitFor({ state: 'attached' }); assert.equal(await page.locator('[data-hidi-product-delete]').count(), state.records.size, 'Products list retains deletion controls'); if ((await page.viewportSize()).width < 900) { await page.locator('[data-hidi-admin-workspace] header').getByRole('button', { name: 'Open navigation', exact: true }).click(); const drawer = page.getByRole('dialog', { name: 'Admin navigation', exact: true }); await drawer.waitFor(); assert.equal(await drawer.locator('[data-hidi-admin-tool]').count(), contract.candidateTools.length); for (const link of await drawer.locator('[data-hidi-admin-tool]').all()) { await link.scrollIntoViewIfNeeded(); const bounds = await link.boundingBox(); assert(bounds && bounds.x >= 0 && bounds.x + bounds.width <= (await page.viewportSize()).width + 1, 'Every retained and new mobile tab fits the drawer'); } await drawer.getByRole('button', { name: 'Close navigation', exact: true }).click(); }
  assert.equal(state.writes.length, writeCount, 'Opening retained Admin tools never performs a fixture write');
  return true;
}

export async function runCandidateRegression() {
  const runtime = process.env.HIDI_CANDIDATE_RUNTIME; assert(runtime, 'HIDI_CANDIDATE_RUNTIME must point to the extracted candidate application');
  const contract = await runtimeNavigationContract(runtime); const root = resolve(runtime), reportPath = resolve(process.env.HIDI_UPLOAD_OUTPUT || 'evidence/product-upload/candidate/report.json'), output = dirname(reportPath);
  const playwright = await import(process.env.HIDI_PLAYWRIGHT_MODULE ? pathToFileURL(process.env.HIDI_PLAYWRIGHT_MODULE).href : 'playwright');
  const engines = (process.env.HIDI_BROWSER_ENGINES || 'chromium,firefox,webkit').split(','); assert.deepEqual([...engines].sort(), ['chromium', 'firefox', 'webkit']);
  const escaped = [], results = []; let currentState = null, log = '', child, baselineChild;
  const upstream = createServer((request, response) => { if (!['GET', 'HEAD'].includes(request.method)) escaped.push(request.method + ' ' + request.url); response.writeHead(401, { 'content-type': 'application/json' }); response.end('{"message":"Read-only fixture: no production access."}'); });
  const upstreamPort = await listen(upstream), reserve = createServer(), serverPort = await listen(reserve); await close(reserve);
  const startRuntime = (application, port, prefix = '') => { const processChild = spawn(process.execPath, [join(application, 'server.mjs')], { cwd: application, detached: true, env: { ...process.env, PORT: String(port), API_URL: 'http://127.0.0.1:' + upstreamPort + '/v1', INTERNAL_API_URL: 'http://127.0.0.1:' + upstreamPort + '/v1' }, stdio: ['ignore', 'pipe', 'pipe'] }); ownedProcessGroups.add(processChild); processChild.stdout.on('data', data => { log += prefix + data; }); processChild.stderr.on('data', data => { log += prefix + data; }); return processChild; };
  const baselineReserve = createServer(), baselinePort = await listen(baselineReserve); await close(baselineReserve);
  baselineChild = startRuntime(contract.baseRoot, baselinePort, '[baseline] ');
  const baselineBase = 'http://127.0.0.1:' + baselinePort;
  const proxy = createServer(async (request, response) => {
    const pathname = new URL(request.url, 'http://fixture.invalid').pathname;
    if (request.method === 'POST' && /^\/api\/admin\/inventory\/[^/]+\/images$/.test(pathname) && currentState) {
      try { await receivePhoto(currentState, request, response); } catch (error) { currentState.bad.push(error.stack); response.writeHead(500, { 'content-type': 'application/json' }); response.end(JSON.stringify({ message: error.message })); } return;
    }
    if (!['GET', 'HEAD'].includes(request.method)) { escaped.push(request.method + ' ' + request.url); response.writeHead(405); response.end(); return; }
    const forwarded = httpRequest({ hostname: '127.0.0.1', port: serverPort, path: request.url, method: request.method, headers: { ...request.headers, host: '127.0.0.1:' + serverPort } }, upstreamResponse => { response.writeHead(upstreamResponse.statusCode, upstreamResponse.headers); upstreamResponse.pipe(response); });
    forwarded.on('error', () => { if (!response.headersSent) response.writeHead(503); response.end(); }); request.pipe(forwarded);
  });
  const base = 'http://127.0.0.1:' + await listen(proxy); await mkdir(output, { recursive: true }); const photoFolder = await mkdtemp(join(tmpdir(), 'hidi-product-upload-fixture-')); for (const file of photoFiles('fixture-cotton')) await writeFile(join(photoFolder, file.name), file.buffer);
  try {
    let ready = false; for (let attempt = 0; attempt < 150; attempt++) { try { if ((await fetch(baselineBase + '/health', { signal: AbortSignal.timeout(1500) })).ok) { ready = true; break; } } catch {} assert.equal(baselineChild.exitCode, null, 'Captured baseline must start: ' + log.slice(-2000)); await sleep(200); } assert(ready, 'Captured baseline readiness');
    const baselineRoutes = [], retainedRoutes = [];
    for (const path of [...new Set([...contract.baselineTools.map(tool => tool.href), ...OLD_NATIVE_PATHS, '/admin/product-delete', '/admin/product-photos'])]) {
      const before = await fetch(baselineBase + path, { signal: AbortSignal.timeout(30000) });
      if (contract.baselineTools.some(tool => tool.href === path) || OLD_NATIVE_PATHS.includes(path) || path === '/admin/product-delete') assert.equal(before.status, 200, 'Existing navigation and supported Admin route remains available: ' + path);
      baselineRoutes.push({ path, status: before.status, contentType: before.headers.get('content-type') }); await before.arrayBuffer();
    }
    assert.equal((await fetch(baselineBase + UPLOAD_PATH)).status, 404, 'Captured baseline has no Product Upload page');
    await stop(baselineChild); baselineChild = null; child = startRuntime(root, serverPort);
    ready = false; for (let attempt = 0; attempt < 150; attempt++) { try { if ((await fetch(base + '/health', { signal: AbortSignal.timeout(1500) })).ok) { ready = true; break; } } catch {} assert.equal(child.exitCode, null, 'Candidate must start: ' + log.slice(-2000)); await sleep(200); } assert(ready, 'Actual retained candidate readiness');
    for (const before of baselineRoutes) { const after = await fetch(base + before.path, { signal: AbortSignal.timeout(30000) }); assert.equal(after.status, before.status, 'Retained route status exactly matches captured baseline: ' + before.path); assert.equal(after.headers.get('content-type'), before.contentType, 'Retained route media type matches: ' + before.path); retainedRoutes.push({ path: before.path, baselineStatus: before.status, candidateStatus: after.status }); await after.arrayBuffer(); }
    assert.equal((await fetch(base + UPLOAD_PATH)).status, 200, 'Candidate adds the Product Upload page');
    const templateResponse = await fetch(base + '/admin-tools-assets/product-upload/HIDI_Product_Upload_Template.xlsx'); assert.equal(templateResponse.status, 200); assert.match(templateResponse.headers.get('content-type'), /spreadsheetml|octet-stream/); const template = Buffer.from(await templateResponse.arrayBuffer()); assert(template.equals(await readFile('deploy/product-upload/HIDI_Product_Upload_Template.xlsx')), 'Runtime serves the reviewed full template byte for byte');
    const entries = zipEntries(template); assert(entries.get('xl/workbook.xml').toString().includes('name="Products"')); assert(entries.get('xl/workbook.xml').toString().includes('name="Examples"')); assert(entries.get('xl/workbook.xml').toString().includes('name="Field guide"'));
    for (const path of ['/api/admin/products/options', '/api/admin/products', '/api/admin/inventory', '/api/hidi/product-image-skus']) assert.equal((await fetch(base + path)).status, 401, 'Actual route requires staff auth: ' + path);
    for (const engine of engines) {
      const browser = await playwright[engine].launch({ headless: true });
      try {
        for (const viewport of VIEWPORTS) {
          const state = fixtureState(); currentState = state;
          const context = await browser.newContext({ viewport, reducedMotion: 'reduce', serviceWorkers: 'block' }), page = await context.newPage(), errors = [];
          const retainedHydrationErrors = []; page.setDefaultTimeout(20000); page.on('pageerror', error => { if (new URL(page.url()).pathname === '/admin/products' && error.message === RETAINED_HYDRATION_ERROR) retainedHydrationErrors.push(error.message); else errors.push(error.message); }); page.on('dialog', dialog => dialog.accept());
          await context.route(url => !(url.origin === base && /^\/api\/admin\/inventory\/[^/]+\/images$/.test(url.pathname)), async route => {
            const request = route.request(), url = new URL(request.url()), method = request.method();
            if (url.origin !== base) return route.abort();
            if (url.pathname.startsWith('/api/admin/') || url.pathname.startsWith('/api/hidi/')) {
              try { const result = await fixtureApi(state, method, url, ['GET', 'HEAD'].includes(method) ? {} : request.postDataJSON()); return route.fulfill({ status: result.status || 200, contentType: 'application/json', body: JSON.stringify(result.body) }); } catch (error) { state.bad.push(error.stack); return route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ message: error.message }) }); }
            }
            if (!['GET', 'HEAD'].includes(method)) { state.bad.push(method + ' ' + url.pathname); return route.abort(); }
            // Fixture photo URLs cannot reach any real object storage.
            if (url.pathname.startsWith('/media/products/variants/source/')) return route.fulfill({ status: 200, contentType: 'image/png', body: PHOTO_BYTES });
            return route.continue();
          });
          try {
            for (const status of [401, 403]) { state.auth = status; await page.goto(base + '/admin/product-upload', { waitUntil: 'domcontentloaded' }); await page.locator('#auth').waitFor(); assert(await page.locator('#upload-flow').isHidden(), 'Unauthorized staff cannot choose or save products'); assert(await page.locator('#save-draft').isHidden()); assert(await page.locator('#publish').isHidden()); assert.equal(state.writes.length, 0); }
            state.auth = 200; await openTool(page, base);
            const downloadPromise = page.waitForEvent('download'); await page.locator('#template').click(); const download = await downloadPromise; assert.equal(download.suggestedFilename(), 'HIDI_Product_Upload_Template.xlsx'); assert((await readFile(await download.path())).equals(template), 'Browser downloads real template, not a CSV or placeholder');
            // A blank Products sheet must not import examples or enable saves.
            await page.locator('#product-file').setInputFiles({ name: 'blank-template.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: template }); await page.locator('#preview').click(); await page.locator('#status').filter({ hasText: /no product rows|empty/i }).waitFor(); assert.equal(state.writes.length, 0);
            await review(page, template, newRows(), photoFiles('fixture-cotton'), photoFolder); assert.equal(state.writes.length, 0, 'Review performs no creation, variant, mapping, image or status write'); assert.equal(await page.locator('#product-groups .product-card').count(), 1, 'Repeated size rows group into one product'); const variantFact = page.locator('#product-groups .product-facts .fact').filter({ has: page.locator('dt').filter({ hasText: /^variants$/i }) }); assert.equal(await variantFact.count(), 1, 'One explicit variant-count fact'); assert.equal((await variantFact.locator('dd').textContent()).trim(), '4', 'Review shows exactly four grouped variants'); await page.locator('#product-groups summary').click(); assert.match(await page.locator('#product-groups').innerText(), /Ivory/); assert.match(await page.locator('#product-groups').innerText(), /XXL/);
            await page.locator('#save-draft').focus(); await page.keyboard.press('Tab'); await page.keyboard.press('Shift+Tab'); assert.equal(await page.evaluate(() => document.activeElement.id), 'save-draft', 'Keyboard traversal returns to Save as draft'); assert.equal(await page.locator('#save-draft').evaluate(element => element.matches(':focus-visible')), true, 'Real keyboard traversal activates focus-visible'); assert.notEqual(await page.locator('#save-draft').evaluate(element => getComputedStyle(element).outlineStyle), 'none', 'Keyboard focus is visible');
            await finish(page, '#save-draft'); const draft = bySlug(state, 'fixture-cotton'); assert(draft, 'Draft product saved'); assert.equal(draft.status, 'DRAFT'); assert.equal(state.published.length, 0); assert.equal(draft.variants.length, 4); assert(draft.variants.every(variant => variant.inventory.onHand === 0 && variant.inventory.reserved === 0)); assert(draft.variants.every(variant => variant.images.length === 2)); assert.deepEqual(state.photos.map(photo => photo.number), [1, 2]); assert.deepEqual(state.photos.map(photo => photo.isMain), [false, true]); assert(state.photos.every(photo => photo.targetIds.length === 4 && photo.alt === 'Ivory cotton kurta, photographed for the fixture.')); assert.match(draft.description, /Includes: 1 kurta/); assert.match(draft.description, /Fit: Relaxed/); assert.deepEqual(draft.collections.map(collection => collection.collectionId).sort(), ['ananya', 'everyday']); assert(![...state.records.values()].filter(product => product.status === 'ACTIVE').some(product => product.id === draft.id), 'Saved draft cannot appear in the storefront projection'); const beforeDraftPromotion = state.writes.length; await page.locator('#publish').filter({ hasText: 'Publish saved drafts to storefront' }).waitFor(); await finish(page, '#publish'); assert.equal(draft.status, 'ACTIVE'); assert.equal(state.photos.filter(photo => photo.productId === draft.id).length, 2, 'Publishing a saved draft does not upload its files again'); assert(state.writes.slice(beforeDraftPromotion).every(write => !write.path.endsWith('/variants') && write.path !== '/api/admin/products' && !write.path.endsWith('/images')), 'Saved draft publication preserves variants, stock and completed photos'); assert(await page.locator('#publish').isDisabled(), 'Published products are excluded from repeat actions');
            // Different publication intent is exercised on an independent batch.
            await openTool(page, base); state.losePhotoResponse = true; const publishedRows = [...newRows('fixture-publish', { product_name: 'Fixture Published Cotton Kurta' }), ...newRows('fixture-publish', { product_name: 'Fixture Published Cotton Kurta', color: 'Rose', color_hex: '#A04050', image_sku: 'FIXTURE_PUBLISH_ROSE', photo_names: 'FIXTURE_PUBLISH_ROSE_1.png;FIXTURE_PUBLISH_ROSE_2.png', main_photo: 'FIXTURE_PUBLISH_ROSE_2.png', photo_alt: 'Rose cotton kurta, fixture photo.' })]; await review(page, template, publishedRows, [...photoFiles('fixture-publish'), ...photoFiles('fixture-publish-rose')]); const beforePublish = state.writes.length; await finish(page, '#publish'); const published = bySlug(state, 'fixture-publish'); assert.equal(published.status, 'ACTIVE'); assert(published.variants.every(variant => variant.images.length === 2)); assert.equal(state.published.filter(id => id === published.id).length, 1); assert.equal(published.variants.length, 8); assert.equal(state.photos.filter(photo => photo.productId === published.id).length, 4, 'Lost successful response reconciles without duplicate upload'); for (const variant of published.variants) { const colorPhotos = state.photos.filter(photo => photo.productId === published.id && photo.targetIds.includes(variant.id)); assert.equal(colorPhotos.length, 2); assert(colorPhotos.every(photo => photo.imageSku === (variant.color === 'Rose' ? 'FIXTURE_PUBLISH_ROSE' : 'FIXTURE_PUBLISH')), 'A colour never receives another colour’s photo'); } const publishWrites = state.writes.slice(beforePublish); assert(publishWrites.at(-1).path.endsWith('/status'), 'Publication is the final product action');
            if ([390, 1440].includes(viewport.width)) await page.screenshot({ path: join(output, engine + '-' + viewport.width + '-published.png'), fullPage: true });
            // Blank update fields retain URL, prices, sizing, collections and media;
            // both new and existing stock are outside this tool's writes.
            const original = oldProduct(); state.records.set(original.id, clone(original)); await openTool(page, base); await review(page, template, [{ action: 'UPDATE', product_key: 'fixture-update', product_id: original.id, color: 'Ivory', size: 'M', product_name: 'Fixture Renamed Ivory Kurta' }]); const updateStart = state.writes.length; await finish(page, '#save-draft'); const updated = state.records.get(original.id); assert.equal(updated.status, 'DRAFT'); assert.equal(updated.name, 'Fixture Renamed Ivory Kurta'); for (const field of ['slug', 'skn', 'categoryId', 'shortDescription', 'description', 'fabric', 'care', 'collections', 'images', 'variants']) assert.deepEqual(field === 'collections' ? [...updated[field]].sort((a, b) => a.collectionId.localeCompare(b.collectionId)) : updated[field], field === 'collections' ? [...original[field]].sort((a, b) => a.collectionId.localeCompare(b.collectionId)) : original[field], 'Blank UPDATE preserves ' + field); const updateWrites = state.writes.slice(updateStart); assert.equal(updateWrites[0].body.status, 'DRAFT', 'Existing live product is hidden before updates'); assert(updateWrites.every(write => !write.path.includes('/inventory/')));
            // A genuine photo failure leaves the whole product in DRAFT and the
            // retry only sends its missing hashes, retaining completed variants.
            await openTool(page, base); state.failPhotoNumber = 2; await review(page, template, newRows('fixture-photo-retry'), photoFiles('fixture-photo-retry')); await finish(page, '#publish'); const failedPhoto = bySlug(state, 'fixture-photo-retry'); assert.equal(failedPhoto.status, 'DRAFT'); assert.equal(state.published.includes(failedPhoto.id), false); assert(failedPhoto.variants.every(variant => variant.images.length === 1), 'Partial upload retains only its confirmed first photo'); assert.match(await page.locator('#report-rows').innerText(), /failed|unavailable|resume|not published/i); const beforeRetry = state.writes.length; await finish(page, '#publish'); assert.equal(failedPhoto.status, 'ACTIVE'); assert.equal(failedPhoto.variants.length, 4); assert.equal(state.writes.slice(beforeRetry).filter(write => write.path.endsWith('/variants')).length, 0, 'Resume cannot duplicate variants or opening stock'); assert.equal(state.photos.filter(photo => photo.productId === failedPhoto.id).length, 2);
            // Variant creation failure prevents images and publication entirely;
            // resume adopts the existing draft instead of creating another one.
            await openTool(page, base); state.failVariant = true; await review(page, template, newRows('fixture-variant-retry'), photoFiles('fixture-variant-retry')); await finish(page, '#publish'); const failedVariant = bySlug(state, 'fixture-variant-retry'); assert.equal(failedVariant.status, 'DRAFT'); assert.equal(failedVariant.variants.length, 1); assert.equal(state.photos.filter(photo => photo.productId === failedVariant.id).length, 0); assert.equal(state.published.includes(failedVariant.id), false); await finish(page, '#publish'); assert.equal(failedVariant.status, 'ACTIVE'); assert.equal(failedVariant.variants.length, 4); assert.equal(state.writes.filter(write => write.path === '/api/admin/products' && write.body?.slug === failedVariant.slug).length, 1, 'Resume never creates duplicate products');
            // Session expiry stops the batch; rechecking access is read-only and
            // restores the same approved files without automatic publication.
            await openTool(page, base); state.expireOnPhotoNumber = 2; await review(page, template, newRows('fixture-session-retry'), photoFiles('fixture-session-retry')); await page.locator('#publish').click(); await page.locator('#auth').waitFor(); assert(await page.locator('#upload-flow').isHidden()); const sessionDraft = bySlug(state, 'fixture-session-retry'); assert.equal(sessionDraft.status, 'DRAFT'); assert.equal(state.published.includes(sessionDraft.id), false); assert.equal(state.photos.filter(photo => photo.productId === sessionDraft.id).length, 1); state.auth = 200; const recoveryWrites = state.writes.length; await page.locator('#auth-check').click(); await page.locator('#upload-flow').waitFor(); assert.equal(state.writes.length, recoveryWrites, 'Rechecking staff access never resumes writes automatically'); await finish(page, '#publish'); assert.equal(sessionDraft.status, 'ACTIVE'); assert.equal(state.photos.filter(photo => photo.productId === sessionDraft.id).length, 2, 'Recovered session resumes only the missing photo');
            const retainedAdminVerified = await retainedAdminCheck(page, base, state, contract);
            assert.deepEqual(state.bad, [], 'All traffic matched isolated API fixtures'); assert.deepEqual(errors, [], 'New uploader and retained controls have no new uncaught page errors'); assert(retainedHydrationErrors.length <= 1, 'Only the exact single proven retained Admin hydration warning is allowed'); if (retainedHydrationErrors.length) assert.equal(await page.locator('script[data-hidi-admin-quick-tools]').count(), 1, 'Known warning is confined to the original retained Admin shell'); assert.equal(state.writes.filter(write => write.path.includes('/inventory/') && !write.path.endsWith('/images')).length, 0, 'No inventory quantity or receipt writes'); assert.deepEqual(escaped, [], 'No write escaped localhost fixtures');
            results.push({ engine, ...viewport, passed: true, fixtureDraftSaved: true, fixtureImagesUploaded: true, fixturePublished: true, retainedAdminVerified, reviewReadOnly: true, photoOrderAndMainVerified: true, updateBlanksPreserved: true, photoFailureStayedDraft: true, variantFailureStayedDraft: true, retriesAvoidDuplicates: true, lostResponseReconciled: true, authExpiryStopsAndResumesSafely: true, folderPreviewVerified: true, multiColourMappingVerified: true, savedDraftPublicationAvoidsDuplicates: true, inventoryWrites: 0, fixtureWrites: state.writes.length, fixturePhotoWrites: state.photos.length, retainedBaselineHydrationWarnings: retainedHydrationErrors.length, liveWrites: 0 }); console.log('PASS Product Upload: ' + engine + ' ' + viewport.width + '×' + viewport.height);
          } catch (error) { await page.screenshot({ path: join(output, engine + '-' + viewport.width + '-failure.png'), fullPage: true }).catch(() => {}); await writeFile(join(output, engine + '-' + viewport.width + '-failure.json'), JSON.stringify({ error: error.stack, body: await page.locator('body').innerText().catch(() => ''), fixture: { calls: state.calls, writes: state.writes, photos: state.photos, bad: state.bad, records: [...state.records.values()] }, errors, escaped }, null, 2)); throw error; }
          finally { currentState = null; await context.close(); }
        }
      } finally { await browser.close(); }
    }
    assert.equal(results.length, 12); assert.deepEqual(escaped, []); const report = { passed: true, liveWrites: 0, actualRetainedRuntime: true, templateRoundTrip: true, authVerified: true, sourceThemeInjected: false, results, templateSha256: hash(template), fixtureOnlyWrites: true, productionDatabaseWrites: 0, productionBlobWrites: 0, baselineTools: contract.baselineTools, candidateTools: contract.candidateTools, baselineNavigationSha256: contract.baselineNavigationSha256, candidateNavigationSha256: contract.candidateNavigationSha256, retainedRoutes }; await writeFile(reportPath, JSON.stringify(report, null, 2)); console.log(JSON.stringify({ passed: true, matrixCases: results.length, report: reportPath })); return report;
  } catch (error) { await writeFile(join(output, 'server.log'), log); throw error; }
  finally { currentState = null; await close(proxy); await stop(child); await stop(baselineChild); await close(upstream); await rm(photoFolder, { recursive: true, force: true }); }
}

/** Read-only production verification. This routine never opens a signed-in
 * session or submits a form; only GET and HEAD requests reach the live origin.
 */
export async function runReadOnlyLiveProbe(origin, output = 'evidence/product-upload/live') {
  const base = new URL(origin).origin; assert(base.startsWith('https://'), 'Live verification requires the explicit HTTPS storefront origin');
  const contract = await runtimeNavigationContract(), candidateReport = JSON.parse(await readFile('evidence/product-upload/candidate/report.json', 'utf8'));
  assert.equal(candidateReport.passed, true, 'Complete tested candidate report required before live verification'); assert.deepEqual(candidateReport.baselineTools, contract.baselineTools); assert.deepEqual(candidateReport.candidateTools, contract.candidateTools); assert.equal(candidateReport.baselineNavigationSha256, contract.baselineNavigationSha256); assert.equal(candidateReport.candidateNavigationSha256, contract.candidateNavigationSha256); assert(Array.isArray(candidateReport.retainedRoutes) && candidateReport.retainedRoutes.length > 0, 'Captured baseline route status evidence required');
  const folder = resolve(output.endsWith('.json') ? dirname(output) : output), reportPath = resolve(output.endsWith('.json') ? output : join(output, 'report.json')); await mkdir(folder, { recursive: true });
  const requests = [], get = async path => { requests.push({ method: 'GET', path }); return fetch(base + path, { headers: { 'cache-control': 'no-cache' }, signal: AbortSignal.timeout(30000) }); };
  const page = await get('/admin/product-upload'); assert.equal(page.status, 200); const pageBytes = Buffer.from(await page.arrayBuffer()); assert(pageBytes.equals(await readFile('deploy/product-upload/page.html')), 'Live uploader page equals the reviewed candidate asset');
  assert.match(page.headers.get('x-robots-tag'), /noindex.*nofollow/); assert.match(page.headers.get('content-security-policy'), /img-src[^;]*blob:/, 'Only uploader allows local photo previews'); assert.match(page.headers.get('content-security-policy'), /connect-src 'self'/); assert.match(page.headers.get('cache-control'), /no-store/);
  const assets = [];
  for (const name of ['client.mjs', 'model.mjs', 'engine.mjs', 'styles.css', 'HIDI_Product_Upload_Template.xlsx']) {
    const path = '/admin-tools-assets/product-upload/' + name, response = await get(path); assert.equal(response.status, 200, 'Live uploader asset ' + name); const bytes = Buffer.from(await response.arrayBuffer()), source = await readFile('deploy/product-upload/' + name); assert(bytes.equals(source), 'Published asset equals the tested bytes: ' + name); assert.match(response.headers.get('x-content-type-options'), /nosniff/);
    if (name.endsWith('.xlsx')) { assert.match(response.headers.get('content-type'), /application\/vnd\.openxmlformats-officedocument\.spreadsheetml\.sheet/); assert.match(response.headers.get('content-disposition'), /attachment; filename="HIDI_Product_Upload_Template.xlsx"/); assert(zipEntries(bytes).has('xl/worksheets/sheet1.xml')); }
    assets.push({ path, sha256: hash(bytes), bytes: bytes.length });
  }
  const retained = [];
  for (const expected of candidateReport.retainedRoutes) { const path = expected.path; assert.equal(expected.baselineStatus, expected.candidateStatus, 'Tested route matched the captured baseline'); const response = await get(path); assert.equal(response.status, expected.candidateStatus, 'Live route preserves its captured and tested status: ' + path); const html = await response.text(); assert(!html.includes('/admin-tools-assets/product-upload/styles.css'), 'Uploader styles remain scoped: ' + path); if (path !== '/admin/landing-media' && contract.baselineTools.some(tool => tool.href === path) || path === '/admin/product-delete') assert(!/img-src[^;]*blob:/.test(response.headers.get('content-security-policy') || ''), 'Retained tool image policy unchanged: ' + path); retained.push({ path, baselineStatus: expected.baselineStatus, candidateStatus: expected.candidateStatus, liveStatus: response.status }); }
  const navigation = await get('/admin-tools-assets/navigation.js'); assert.equal(navigation.status, 200); const navigationText = await navigation.text(); assert.equal(hash(Buffer.from(navigationText)), contract.candidateNavigationSha256, 'Live navigation is the exact tested candidate asset'); assert.deepEqual(parseNavigationTools(navigationText), contract.candidateTools, 'Live navigation adds only Product Upload to the original ordered tools');
  for (const path of ['/api/admin/products/options', '/api/admin/products', '/api/admin/inventory', '/api/hidi/product-image-skus', '/api/hidi/product-deletion/fixture-no-action']) { const response = await get(path); assert.equal(response.status, 401, 'Anonymous staff route denied: ' + path); }
  const customerRoutes = [];
  for (const path of ['/', '/collections/all', '/cart', '/checkout']) { const response = await get(path); assert.equal(response.status, 200, 'Customer route retained: ' + path); const html = await response.text(); assert(!html.includes('/admin-tools-assets/product-upload/'), 'Uploader cannot load on customer pages'); customerRoutes.push({ path, status: response.status }); }
  const report = { passed: true, liveWrites: 0, productionDatabaseWrites: 0, productionBlobWrites: 0, authVerified: true, bytesVerified: true, customerRoutesRetained: true, retainedAdminVerified: true, assets, retained, customerRoutes, requests, baselineTools: contract.baselineTools, candidateTools: contract.candidateTools, baselineNavigationSha256: contract.baselineNavigationSha256, candidateNavigationSha256: contract.candidateNavigationSha256 }; await writeFile(reportPath, JSON.stringify(report, null, 2)); return report;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const live = process.argv.indexOf('--live');
  if (live >= 0) { assert(process.argv[live + 1], '--live requires an explicit origin'); const report = await runReadOnlyLiveProbe(process.argv[live + 1], process.argv[live + 2] || process.env.HIDI_UPLOAD_OUTPUT || 'evidence/product-upload/live'); console.log(JSON.stringify({ passed: report.passed, liveWrites: report.liveWrites, verifiedAssets: report.assets.length })); }
  else await runCandidateRegression();
}

