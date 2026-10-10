import test from 'node:test';
import assert from 'node:assert/strict';
import { MAX_PHOTO_BYTES, parsePhoto, previewPhotos, exactProduct, resolveGroup, targetFor, pendingUploads, photoAlt, confirmedAfterFailure, csvCell, mappingCsv, catalogueCsv } from '../deploy/admin-tools/product-photo-match.mjs';
const file = (name, size = 100, type = '') => ({ name, size, type });
const product = (extra = {}) => ({ id: 'p1', skn: '12345', name: 'Magenta suit', status: 'DRAFT', variants: [
  { id: 'vXXL', color: 'Magenta Pink', size: 'XXL', sku: 'SKU-XXL' },
  { id: 'vL', color: 'Magenta Pink', size: 'L', sku: 'SKU-L' },
  { id: 'vM', color: 'Magenta Pink', size: 'M', sku: 'SKU-M' },
  { id: 'vXL', color: 'Magenta Pink', size: 'XL', sku: 'SKU-XL' },
], ...extra });

test('five-digit SKN file names support the four formats and exact 12 MB boundary', () => {
  for (const [extension, type] of [['jpeg', 'image/jpeg'], ['jpg', 'image/jpeg'], ['png', 'image/png'], ['webp', 'image/webp'], ['avif', 'image/avif']]) {
    const parsed = parsePhoto(file('12345_001_main.' + extension, MAX_PHOTO_BYTES, type));
    assert.equal(parsed.error, ''); assert.equal(parsed.skn, '12345'); assert.equal(parsed.sequence, 1); assert.equal(parsed.isMain, true); assert.equal(parsed.mime, type);
    assert.match(parsePhoto(file('12345_001.' + extension, MAX_PHOTO_BYTES + 1, type)).error, /12 MB/);
  }
  assert.equal(parsePhoto(file('99999_999_MAIN.WEBP')).error, '');
  for (const name of ['01234_001.jpeg', '1234_001.jpeg', '123456_001.jpeg', '12345_000.jpeg', '12345_1.jpeg', '12345_001_main.wbep', '12345_001.gif', '../12345_001.jpeg', '__proto___001.jpeg']) assert.ok(parsePhoto(file(name)).error, name);
  for (const size of [0, -1, 1.1, NaN, Infinity]) assert.ok(parsePhoto(file('12345_001.jpeg', size)).error);
  assert.match(parsePhoto(file('12345_001.jpeg', 10, 'image/png')).error, /type/);
  assert.equal(parsePhoto(file('12345_001.jpeg', 10, '')).mime, 'image/jpeg');
});

test('the entire preview blocks duplicates, multiple mains and excessive file counts', () => {
  const duplicate = previewPhotos([file('12345_001.jpeg'), file('12345_001_main.webp')]);
  assert.equal(duplicate.rows.filter(row => /Duplicate/.test(row.error)).length, 2);
  const mains = previewPhotos([file('12345_001_main.jpeg'), file('12345_002_main.webp')]);
  assert.equal(mains.rows.filter(row => /one _main/.test(row.error)).length, 2);
  assert.equal(previewPhotos([]).errors.length, 1);
  assert.equal(previewPhotos(Array.from({ length: 1001 }, (_, i) => file(`${10000 + i}_001.jpeg`))).errors.length, 1);
  assert.equal(previewPhotos(Array.from({ length: 1000 }, (_, i) => file(`${10000 + i}_001.jpeg`))).errors.length, 0);
  const invalid = previewPhotos([file('12345_001.jpeg'), file('not-a-photo.csv')]); resolveGroup(invalid.groups.get('12345'), product());
  assert.ok(pendingUploads(invalid).errors.length);
});

test('matching uses the exact SKN and rejects unknown, ambiguous or conflicting details', () => {
  assert.equal(exactProduct([product({ skn: '11234' }), product()], '12345').id, 'p1');
  assert.equal(exactProduct([product({ skn: 12345 })], '12345').id, 'p1');
  assert.throws(() => exactProduct([product({ skn: '11234' })], '12345'), /No product/);
  assert.throws(() => exactProduct([product(), product({ id: 'p2' })], '12345'), /More than one/);
  const group = previewPhotos([file('12345_001.jpeg')]).groups.get('12345');
  assert.throws(() => resolveGroup(group, product({ skn: '54321' })), /do not match/);
  assert.throws(() => resolveGroup(group, product({ variants: [] })), /no colour\/size/);
  assert.throws(() => resolveGroup(group, product({ variants: [{ id: 'v1', color: '', size: 'M' }] })), /no colour\/size/);
});

test('one-colour products match every size; several colours require an explicit choice', () => {
  const single = previewPhotos([file('12345_001.jpeg')]).groups.get('12345'); resolveGroup(single, product());
  assert.equal(single.colour, 'Magenta Pink'); assert.equal(targetFor(single).variantId, 'vM'); assert.deepEqual(targetFor(single).sizes, ['M', 'L', 'XL', 'XXL']);
  const multi = previewPhotos([file('12345_001.jpeg')]).groups.get('12345');
  resolveGroup(multi, product({ variants: [...product().variants, { id: 'vBlue', color: 'Blue', size: 'S' }] }));
  assert.equal(multi.colour, ''); assert.throws(() => targetFor(multi), /Choose/);
  multi.colour = 'Blue'; assert.deepEqual(targetFor(multi).variants.map(variant => variant.id), ['vBlue']);
  multi.colour = '__proto__'; assert.throws(() => targetFor(multi), /Choose/);
  multi.colour = 'Magenta Pink'; assert.equal(targetFor(multi).variantId, 'vM');
  const reversed = { ...multi, product: product({ variants: [...product().variants].reverse() }) }; assert.equal(targetFor(reversed).variantId, 'vM');
});

test('uploads put main first, then numeric gallery order and exclude completed photos', () => {
  const preview = previewPhotos([file('12345_010.jpeg'), file('12345_099_main.webp'), file('12345_002.jpeg')]); resolveGroup(preview.groups.get('12345'), product());
  assert.deepEqual(pendingUploads(preview).queue.map(item => item.row.sequence), [99, 2, 10]);
  pendingUploads(preview).queue[0].row.status = 'uploaded'; assert.deepEqual(pendingUploads(preview).queue.map(item => item.row.sequence), [2, 10]);
  preview.rows[0].status = 'uncertain'; assert.ok(pendingUploads(preview).errors.some(error => error.includes('Check the interrupted')));
});

test('interrupted upload is confirmed only when every target size has the same new image URL and alt', () => {
  const preview = previewPhotos([file('12345_001_main.jpeg')]), group = preview.groups.get('12345'); resolveGroup(group, product());
  const target = targetFor(group), alt = photoAlt(group, group.rows[0]);
  const attached = product({ variants: product().variants.map(variant => ({ ...variant, images: [{ url: 'https://media.example/new.jpeg', alt }] })) });
  assert.equal(confirmedAfterFailure(attached, target, alt), true);
  assert.equal(confirmedAfterFailure(attached, target, alt, ['https://media.example/new.jpeg']), false);
  attached.variants[0].images = []; assert.equal(confirmedAfterFailure(attached, target, alt), false);
  attached.variants[0].images = [{ url: 'https://media.example/other.jpeg', alt }]; assert.equal(confirmedAfterFailure(attached, target, alt), false);
  assert.equal(confirmedAfterFailure(product(), target, alt), false);
});

test('CSV mapping reports safely quote user text and neutralize spreadsheet formulas', () => {
  for (const text of ['=SUM(1,2)', '+123', '-123', '@SUM(A1)', ' \t=CMD()', '\n+123']) assert.ok(csvCell(text).startsWith('"\''), JSON.stringify(text));
  assert.equal(csvCell('plain "quoted",text'), '"plain ""quoted"",text"');
  const preview = previewPhotos([file('12345_001_main.jpeg')]), group = preview.groups.get('12345'); resolveGroup(group, product({ name: '=formula' }));
  const csv = mappingCsv(preview); assert.ok(csv.startsWith('\ufeff')); assert.match(csv, /"'=formula"/); assert.match(csv, /"12345"/); assert.match(csv, /"M \/ L \/ XL \/ XXL"/);
  const catalogue = catalogueCsv([product({ name: '=formula' }), product({ id: 'archived', status: 'ARCHIVED' })]);
  assert.match(catalogue, /"12345_001_main.webp"/); assert.ok(!catalogue.includes('archived')); assert.match(catalogue, /"'=formula"/);
  assert.equal(previewPhotos([file('__proto___001.jpeg')]).groups.size, 0);
});
