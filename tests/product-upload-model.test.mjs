import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  HEADERS,
  parseProducts,
  descriptionFields,
  safeCsv,
  reportCsv,
} from '../deploy/product-upload/model.mjs';

const expectedHeaders = [
  'action', 'product_key', 'product_id', 'skn', 'product_slug', 'product_name',
  'category', 'collection_slugs', 'ananyas_pick', 'short_description',
  'description', 'fabric', 'care', 'includes', 'fit', 'lining', 'model',
  'color', 'color_hex', 'size', 'selling_price', 'mrp', 'weight_grams', 'active',
  'bust_mm', 'waist_mm', 'hip_mm', 'shoulder_mm', 'sleeve_length_mm',
  'garment_length_mm', 'image_sku', 'photo_names', 'main_photo', 'photo_alt',
];
const newRow = overrides => ({
  action: 'NEW', product_key: 'sand-kurta', product_name: 'Sand Kurta',
  color: 'Sand', size: 'M', selling_price: '999', mrp: '1499', ...overrides,
});
const updateRow = overrides => ({ action: 'UPDATE', product_key: 'existing', product_id: 'product-1', ...overrides });
const cells = row => HEADERS.map(header => row[header] ?? '');
const sheet = (rows, name = 'Products') => ({ name, rows: [HEADERS, ...rows.map(cells)] });
const parse = rows => parseProducts([sheet(rows)]);
const first = rows => parse(rows).groups[0];

test('the production template exposes every supported catalogue field and no stock or status fields', () => {
  assert.deepEqual(HEADERS, expectedHeaders);
  assert.equal(new Set(HEADERS).size, HEADERS.length);
  for (const unsupported of ['stock', 'status', 'gst', 'hsn', 'purchase_cost', 'seo_title']) assert.ok(!HEADERS.includes(unsupported));
});

test('a Products sheet is preferred and template examples cannot become uploaded products', () => {
  const parsed = parseProducts([
    sheet([newRow({ product_name: 'Must not import' })], 'Examples'),
    { name: 'Instructions', rows: [['Read this before uploading']] },
    sheet([newRow({ product_name: 'Actual Kurta' })]),
  ]);
  assert.equal(parsed.groups.length, 1);
  assert.equal(parsed.groups[0].fields.name, 'Actual Kurta');
  assert.equal(parsed.warnings.length, 2);
  assert.ok(parsed.warnings.some(warning => warning.includes('Examples')));
});

test('a single supplier sheet is accepted but ambiguous or duplicate Products worksheets are blocked', () => {
  assert.equal(parseProducts([sheet([newRow()], 'Supplier'), { name: 'Field guide', rows: [['Help']] }]).groups.length, 1);
  assert.throws(() => parseProducts([sheet([newRow()], 'First'), sheet([newRow()], 'Second')]), /worksheet named Products/i);
  assert.throws(() => parseProducts([sheet([newRow()]), sheet([newRow()], ' products ')]), /worksheet named Products/i);
});

test('empty worksheets and header-only templates never create sample or blank products', () => {
  for (const sheets of [[], [{ name: 'Products', rows: [] }], [{ name: 'Products', rows: [['', '']] }], [sheet([])]]) {
    assert.throws(() => parseProducts(sheets), /choose|empty|no product rows/i);
  }
});

test('unsupported headings and populated cells without headings are never silently dropped', () => {
  for (const unsupported of ['status', 'stock', 'gst', 'hsn', 'seo_title']) {
    assert.throws(() => parseProducts([{ name: 'Products', rows: [[...HEADERS, unsupported], [...cells(newRow()), 'value']] }]), /Unsupported column/i);
  }
  assert.throws(() => parseProducts([{ name: 'Products', rows: [[...HEADERS, ''], [...cells(newRow()), 'unmapped']] }]), /no supported column heading/i);
  assert.throws(() => parseProducts([{ name: 'Products', rows: [[...HEADERS, 'product_name'], [...cells(newRow()), 'duplicate']] }]), /Duplicate column/i);
});

test('headings tolerate casing and spaces while action remains explicit NEW or UPDATE', () => {
  const parsed = parseProducts([{ name: ' Products ', rows: [HEADERS.map(header => header.toUpperCase().replaceAll('_', ' ')), cells(newRow({ action: ' new ' }))] }]);
  assert.equal(parsed.groups[0].action, 'NEW');
  for (const action of ['', 'DRAFT', 'ACTIVE', 'DELETE', 'PUBLISH']) assert.throws(() => parse([newRow({ action })]), /Action must be NEW or UPDATE/i);
  assert.throws(() => parseProducts([{ name: 'Products', rows: [['product_name'], ['Kurta']] }]), /action column is required/i);
});

test('blank rows are skipped and row locations identify invalid input', () => {
  const valid = sheet([newRow()]);
  valid.rows.unshift(['', '', '']);
  valid.rows.splice(2, 0, []);
  const parsed = parseProducts([valid]);
  assert.equal(parsed.groups.length, 1);
  assert.deepEqual(parsed.groups[0].sourceRows, ['Products · row 4']);
  assert.throws(() => parse([newRow({ mrp: 'not a price' })]), /Products · row 2:.*mrp/i);
});

test('rows group exact product details with one typed variant for each colour and size', () => {
  const group = first([
    newRow({ color: '  Sand  ', size: ' m ', color_hex: '#aBc123', short_description: 'An easy day', description: 'Full description', fabric: 'Cotton', care: 'Hand wash', includes: 'Kurta and pants', fit: 'Relaxed', lining: 'Cotton', model: 'Wears M', category: 'Casual Wear', collection_slugs: 'everyday;ananyas-pick', ananyas_pick: 'TRUE', selling_price: '999.50', mrp: '1499.00', weight_grams: '650', active: 'FALSE', bust_mm: '960', waist_mm: '920', hip_mm: '1100', shoulder_mm: '380', sleeve_length_mm: '460', garment_length_mm: '1120' }),
    newRow({ size: 'L' }),
  ]);
  assert.equal(group.action, 'NEW');
  assert.equal(group.key, 'sand-kurta');
  assert.deepEqual(group.identity, { slug: 'sand-kurta' });
  assert.equal(group.fields.name, 'Sand Kurta');
  assert.equal(group.fields.fabric, 'Cotton');
  assert.equal(group.category, 'Casual Wear');
  assert.deepEqual(group.collectionSlugs, ['everyday', 'ananyas-pick']);
  assert.equal(group.ananyaPick, true);
  assert.equal(group.variants.length, 2);
  assert.equal(group.variants[0].color, 'Sand');
  assert.equal(group.variants[0].size, 'M');
  assert.equal(group.variants[0].colorHex, '#ABC123');
  assert.deepEqual(group.variants[0].supplied, { pricePaise: 99950, mrpPaise: 149900, weightGrams: 650, active: false, bustMm: 960, waistMm: 920, hipMm: 1100, shoulderMm: 380, sleeveLengthMm: 460, garmentLengthMm: 1120 });
});

test('blank product keys derive from an explicit slug or a normalised new-product name', () => {
  assert.equal(first([newRow({ product_key: '', product_name: 'Café Summer Kurta' })]).key, 'cafe-summer-kurta');
  assert.equal(first([newRow({ product_key: '', product_slug: 'summer-edit' })]).key, 'summer-edit');
  assert.equal(first([updateRow({ product_key: '' })]).key, 'product-1');
  assert.throws(() => parse([newRow({ product_key: 'folder/name' })]), /stable product_key/i);
  assert.throws(() => parse([newRow({ product_key: '', product_name: '✨' })]), /stable product_key/i);
});

test('new identities cannot impersonate existing SKNs or IDs and updates require an exact lookup identity', () => {
  assert.throws(() => parse([newRow({ product_id: 'existing-id' })]), /Leave product_id and skn blank/i);
  assert.throws(() => parse([newRow({ skn: '12345' })]), /Leave product_id and skn blank/i);
  assert.throws(() => parse([updateRow({ product_id: '' })]), /UPDATE needs an exact existing/i);
  for (const skn of ['01234', '1234', '123456', '1e4']) assert.throws(() => parse([updateRow({ product_id: '', skn })]), /five-digit/i);
  for (const product_slug of ['MixedCase', 'has space', 'folder/name', 'hidi-internal-deleted-test']) assert.throws(() => parse([newRow({ product_slug })]), /lowercase URL/i);
});

test('separate product groups cannot claim the same existing product ID, SKN or slug', () => {
  for (const identity of [{ product_id: 'same-id' }, { product_id: '', skn: '12345' }, { product_id: '', product_slug: 'same-slug' }]) {
    assert.throws(() => parse([updateRow({ product_key: 'a', ...identity }), updateRow({ product_key: 'b', ...identity })]), /same.*different product_key/i);
  }
});

test('conflicting actions, identity or repeated product details are blocked before write planning', () => {
  assert.throws(() => parse([newRow(), updateRow({ product_key: 'sand-kurta' })]), /Conflicting actions/i);
  assert.throws(() => parse([updateRow(), updateRow({ product_id: 'other-product' })]), /Conflicting productId/i);
  for (const field of ['product_name', 'fabric', 'care', 'description', 'category', 'ananyas_pick']) {
    const a = field === 'ananyas_pick' ? 'TRUE' : 'First';
    const b = field === 'ananyas_pick' ? 'FALSE' : 'Second';
    assert.throws(() => parse([newRow({ [field]: a }), newRow({ size: 'L', [field]: b })]), /Conflicting/i);
  }
});

test('an UPDATE with blank details preserves omission rather than inventing clears or defaults', () => {
  const metadataOnly = first([updateRow({ fabric: 'Cotton' })]);
  assert.deepEqual(metadataOnly.fields, { fabric: 'Cotton' });
  assert.deepEqual(metadataOnly.variants, []);
  assert.equal(metadataOnly.category, undefined);
  assert.equal(metadataOnly.collectionSlugs, undefined);
  assert.equal(metadataOnly.ananyaPick, undefined);
  const variant = first([updateRow({ color: 'Sand', size: 'M' })]).variants[0];
  assert.deepEqual(variant.supplied, {});
  assert.equal(variant.colorHex, undefined);
});

test('variant and photo details cannot disappear from metadata-only UPDATE rows', () => {
  for (const details of [{ selling_price: '999' }, { color_hex: '#800000' }, { bust_mm: '950' }, { active: 'FALSE' }, { photo_alt: 'Kurta front' }, { image_sku: 'KUR_001' }]) {
    assert.throws(() => parse([updateRow(details)]), /require colour and size/i);
  }
  for (const details of [{ color: 'Sand' }, { size: 'M' }]) assert.throws(() => parse([updateRow(details)]), /both colour and size/i);
});

test('canonical duplicate variants and readable-token collisions are blocked', () => {
  assert.throws(() => parse([newRow(), newRow({ color: ' sAnD ', size: ' m ' })]), /Duplicate colour\/size/i);
  assert.throws(() => parse([newRow({ color: 'Blue-Grey' }), newRow({ color: 'Blue Grey', size: 'L' })]), /duplicate|collision|same.*sku|conflict/i);
  assert.throws(() => parse([newRow({ size: 'L+' }), newRow({ size: 'L-' })]), /duplicate|collision|same.*sku|conflict/i);
});

test('new rows require name, colour, size and explicit prices without a required category', () => {
  assert.equal(first([newRow({ category: '' })]).fields.name, 'Sand Kurta');
  for (const field of ['product_name', 'color', 'size', 'selling_price', 'mrp']) assert.throws(() => parse([newRow({ [field]: '' })]), /required|require|both colour|Product name/i);
  assert.throws(() => parse([newRow({ selling_price: '1500', mrp: '1499' })]), /cannot exceed MRP/i);
});

test('prices accept only exact rupee decimals within supported paise bounds', () => {
  assert.equal(first([newRow({ selling_price: '0.01', mrp: '1000000.00' })]).variants[0].supplied.pricePaise, 1);
  for (const selling_price of ['0', '-1', '01', '1e3', '1,999', '₹999', '999.999', '1000000.01', 'Infinity']) assert.throws(() => parse([newRow({ selling_price })]), /selling_price/i);
});

test('TRUE, FALSE, 1 and 0 are explicit while ambiguous boolean values fail', () => {
  const group = first([newRow({ active: ' false ', ananyas_pick: ' true ' })]);
  assert.equal(group.variants[0].supplied.active, false);
  assert.equal(group.ananyaPick, true);
  assert.equal(first([newRow({ active: '1', ananyas_pick: '0' })]).variants[0].supplied.active, true);
  assert.equal(first([newRow({ active: '1', ananyas_pick: '0' })]).ananyaPick, false);
  for (const value of ['yes', 'no', 'maybe']) {
    assert.throws(() => parse([newRow({ active: value })]), /TRUE, FALSE/i);
    assert.throws(() => parse([newRow({ ananyas_pick: value })]), /TRUE, FALSE/i);
  }
});

test('weight and garment measurements use whole millimetres and actual API ranges', () => {
  const bounds = { weight_grams: [1, 100000], bust_mm: [200, 3000], waist_mm: [200, 3000], hip_mm: [200, 3000], shoulder_mm: [100, 1000], sleeve_length_mm: [50, 1500], garment_length_mm: [100, 2500] };
  for (const [field, [min, max]] of Object.entries(bounds)) {
    for (const valid of [min, max]) assert.doesNotThrow(() => parse([newRow({ [field]: String(valid) })]));
    for (const invalid of [String(min - 1), String(max + 1), '10.5', '1e3', '960 mm']) assert.throws(() => parse([newRow({ [field]: invalid })]), new RegExp(field));
  }
});

test('description limits and control characters are rejected instead of truncated', () => {
  for (const [field, max] of Object.entries({ product_name: 160, short_description: 400, description: 10000, fabric: 300, care: 2000, photo_alt: 1000 })) {
    assert.throws(() => parse([newRow({ [field]: 'x'.repeat(max + 1) })]), /too long/i);
  }
  assert.throws(() => parse([newRow({ fabric: 'Cotton\u0000linen' })]), /invalid characters/i);
});

test('collection lists preserve exact slugs, compare order independently and reject duplicates', () => {
  assert.deepEqual(first([newRow({ collection_slugs: 'everyday;ananyas-pick' }), newRow({ size: 'L', collection_slugs: 'ananyas-pick;everyday' })]).collectionSlugs.sort(), ['ananyas-pick', 'everyday']);
  for (const value of ['everyday;everyday', 'everyday;', 'Casual Wear', Array.from({ length: 21 }, (_, i) => 'collection-' + i).join(';')]) assert.throws(() => parse([newRow({ collection_slugs: value })]), /duplicates|empty entry|collection slugs/i);
});

test('photo lists use exact safe filenames and a main photo must belong to the colour upload', () => {
  const group = first([newRow({ image_sku: 'kur_001', photo_names: 'Front.jpg;Side.webp', main_photo: 'Front.jpg', photo_alt: 'Sand Kurta front' })]);
  assert.equal(group.variants[0].imageSku, 'KUR_001');
  assert.deepEqual(group.variants[0].photoNames, ['Front.jpg', 'Side.webp']);
  assert.equal(group.variants[0].mainPhoto, 'Front.jpg');
  assert.throws(() => parse([newRow({ photo_names: 'Front.jpg' })]), /image_sku is required/i);
  for (const photo_names of ['Front.jpg;front.JPG', 'Front.jpg;', '../Front.jpg', 'folder\\Front.jpg', '.']) assert.throws(() => parse([newRow({ image_sku: 'KUR_001', photo_names })]), /duplicates|empty entry|filenames/i);
  assert.throws(() => parse([newRow({ image_sku: 'KUR_001', photo_names: 'Front.jpg', main_photo: 'Missing.jpg' })]), /one of photo_names/i);
});

test('image codes cannot attach different products or colours to the same mapping', () => {
  for (const image_sku of ['001', 'KUR 001', 'KUR/001', 'KUR__001', 'K'.repeat(65)]) assert.throws(() => parse([newRow({ image_sku })]), /image_sku needs a unique code/i);
  assert.doesNotThrow(() => parse([newRow({ image_sku: 'KUR_001' }), newRow({ size: 'L', image_sku: 'KUR_001' })]));
  assert.throws(() => parse([newRow({ image_sku: 'KUR_001' }), newRow({ product_key: 'other', product_name: 'Other Kurta', image_sku: 'KUR_001' })]), /different products or colours/i);
  assert.throws(() => parse([newRow({ image_sku: 'KUR_001' }), newRow({ color: 'Ivory', size: 'L', image_sku: 'KUR_001' })]), /different products or colours/i);
});

test('all nonblank per-colour photo and colour choices must agree even after an initially blank row', () => {
  for (const [field, firstValue, secondValue] of [
    ['image_sku', 'KUR_001', 'KUR_002'],
    ['photo_alt', 'Front view', 'Side view'],
    ['color_hex', '#800000', '#900000'],
    ['main_photo', 'Front.jpg', 'Side.jpg'],
  ]) {
    const photos = field === 'main_photo' ? { image_sku: 'KUR_001', photo_names: 'Front.jpg;Side.jpg' } : {};
    assert.throws(() => parse([
      newRow(), newRow({ size: 'L', ...photos, [field]: firstValue }), newRow({ size: 'XL', ...photos, [field]: secondValue }),
    ]), /Conflicting/i);
  }
});

test('batch bounds stop oversized imports before execution', () => {
  assert.throws(() => parse(Array.from({ length: 501 }, (_, index) => newRow({ product_key: 'product-' + index, product_name: 'Kurta ' + index }))), /at most 500 products/i);
  assert.throws(() => parse(Array.from({ length: 201 }, (_, index) => newRow({ color: 'Colour ' + index }))), /At most 200 variants/i);
  assert.throws(() => parseProducts([{ name: 'Products', rows: [HEADERS, ...Array.from({ length: 5001 }, (_, index) => cells(updateRow({ product_key: 'p-' + index, product_id: 'id-' + index })))] }]), /at most 5000 variant rows/i);
});

test('labelled product facts replace their own old lines while retaining unrelated prose and facts', () => {
  const description = descriptionFields({ fields: { includes: 'Kurta and pants', fit: 'Relaxed' } }, { description: 'Original prose\nIncludes: Old pieces\nFIT: Old fit\nLining: Cotton\nAnother sentence' });
  assert.equal(description, 'Original prose\nLining: Cotton\nAnother sentence\nIncludes: Kurta and pants\nFit: Relaxed');
  assert.equal(descriptionFields({ fields: {} }, { description: 'Existing detail' }), 'Existing detail');
  assert.equal(descriptionFields({ fields: { description: 'New prose', model: 'Wears M' } }, { description: 'Old prose' }), 'New prose\nModel: Wears M');
  assert.throws(() => descriptionFields({ fields: { description: 'x'.repeat(10000), fit: 'Relaxed' } }, null), /exceeds 10,000/i);
});

test('CSV exports quote cells and prevent spreadsheet formula execution', () => {
  const csv = safeCsv([['=HYPERLINK("x")', '\t+SUM(1)', ' @SUM(1)', '-2', 'ordinary, "quoted"\ntext']]);
  assert.ok(csv.startsWith('\ufeff'));
  for (const text of ['=HYPERLINK', '\t+SUM', ' @SUM', '-2']) assert.ok(csv.includes('"\'' + text));
  assert.ok(csv.includes('ordinary, ""quoted""\ntext'));
  const report = reportCsv({ intent: 'DRAFT', results: [{ key: 'sand-kurta', name: '=Unsafe name', productId: 'p1', stage: 'metadata', state: 'failed', message: 'Changed by another staff member' }] });
  assert.ok(report.includes('product_key'));
  assert.ok(report.includes("'=Unsafe name"));
  assert.ok(report.includes('Changed by another staff member'));
});
