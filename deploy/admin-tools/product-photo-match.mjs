// Shared by the browser preview and fixture tests. No uploads happen in this module.
export const MAX_PHOTO_BYTES = 12 * 1024 * 1024;
export const MAX_PHOTO_FILES = 1000;
const MIME_BY_EXTENSION = new Map([['jpg', 'image/jpeg'], ['jpeg', 'image/jpeg'], ['png', 'image/png'], ['webp', 'image/webp'], ['avif', 'image/avif']]);
const SIZE_ORDER = ['XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', '3XL', 'XXXL', '4XL', 'XXXXL', '5XL'];
const sknValue = value => String(value ?? '');

export function parsePhoto(file) {
  const name = String(file?.name ?? '');
  const row = { file, name, skn: '', sequence: null, isMain: false, mime: '', size: Number(file?.size), error: '', status: 'pending', message: '', attempted: false };
  const match = /^([1-9]\d{4})_(\d{3})(_main)?\.(jpe?g|png|webp|avif)$/i.exec(name);
  if (!match || Number(match[2]) < 1) {
    row.error = 'Use a five-digit SKN and photo number 001–999: 12345_001_main.webp or 12345_002.jpeg. WebP files end in .webp.';
    return row;
  }
  row.skn = match[1]; row.sequence = Number(match[2]); row.isMain = Boolean(match[3]);
  row.mime = MIME_BY_EXTENSION.get(match[4].toLowerCase());
  if (!Number.isInteger(row.size) || row.size < 1 || row.size > MAX_PHOTO_BYTES) row.error = 'Photo must be between 1 byte and 12 MB.';
  else if (file.type && String(file.type).toLowerCase() !== row.mime) row.error = 'File type does not match its extension. Use JPEG, PNG, WebP or AVIF.';
  return row;
}

export function comparePhotos(a, b) {
  return a.skn.localeCompare(b.skn) || Number(b.isMain) - Number(a.isMain) || a.sequence - b.sequence || a.name.localeCompare(b.name);
}

export function previewPhotos(files) {
  const rows = Array.from(files ?? [], parsePhoto);
  const errors = [];
  if (!rows.length) errors.push('Choose at least one photo.');
  if (rows.length > MAX_PHOTO_FILES) errors.push('Choose no more than 1,000 photos per batch.');
  const groups = new Map();
  for (const row of rows) {
    if (!row.skn) continue;
    if (!groups.has(row.skn)) groups.set(row.skn, { skn: row.skn, rows: [], product: null, colour: '', colours: [], error: '' });
    groups.get(row.skn).rows.push(row);
  }
  for (const group of groups.values()) {
    const bySequence = new Map();
    for (const row of group.rows) {
      const duplicates = bySequence.get(row.sequence) ?? [];
      duplicates.push(row); bySequence.set(row.sequence, duplicates);
    }
    for (const duplicates of bySequence.values()) if (duplicates.length > 1) for (const row of duplicates) row.error = 'Duplicate photo number for SKN ' + group.skn + '. Give every photo a different three-digit number.';
    if (group.rows.filter(row => row.isMain).length > 1) for (const row of group.rows.filter(row => row.isMain)) row.error = 'Only one _main photo is allowed for SKN ' + group.skn + ' in a batch.';
    group.rows.sort(comparePhotos);
  }
  return { rows, groups, errors };
}

export function exactProduct(products, skn) {
  const matches = (Array.isArray(products) ? products : []).filter(product => sknValue(product?.skn) === skn);
  if (matches.length !== 1) throw new Error(matches.length ? 'More than one product has SKN ' + skn + '. Resolve the conflict before uploading.' : 'No product has SKN ' + skn + '. Save the product Excel first and use its assigned SKN.');
  if (!matches[0].id) throw new Error('Product ' + skn + ' has no valid identifier.');
  return matches[0];
}

function usableVariants(product) {
  return (Array.isArray(product?.variants) ? product.variants : []).filter(variant => variant && typeof variant.id === 'string' && variant.id && typeof variant.color === 'string' && variant.color.trim());
}

export function resolveGroup(group, product) {
  if (!product?.id || sknValue(product.skn) !== group.skn) throw new Error('Product details do not match SKN ' + group.skn + '. Preview again.');
  const variants = usableVariants(product);
  if (!variants.length) throw new Error('Product ' + group.skn + ' has no colour/size variants. Add variants before uploading.');
  group.product = product;
  group.colours = [...new Set(variants.map(variant => variant.color))].sort((a, b) => a.localeCompare(b));
  group.colour = group.colours.length === 1 ? group.colours[0] : '';
  group.error = '';
  return group;
}

function compareVariants(a, b) {
  const position = variant => { const index = SIZE_ORDER.indexOf(String(variant.size).toUpperCase()); return index < 0 ? SIZE_ORDER.length : index; };
  return Number(b.active !== false) - Number(a.active !== false) || position(a) - position(b) || String(a.size).localeCompare(String(b.size)) || a.id.localeCompare(b.id);
}

export function targetFor(group) {
  if (!group.product || group.error) throw new Error(group.error || 'Product ' + group.skn + ' needs a valid match.');
  if (!group.colour || !group.colours.includes(group.colour)) throw new Error('Choose the photo colour for SKN ' + group.skn + '.');
  const variants = usableVariants(group.product).filter(variant => variant.color === group.colour).sort(compareVariants);
  if (!variants.length) throw new Error('Chosen colour has no size variants for SKN ' + group.skn + '. Preview again.');
  return { variantId: variants[0].id, colour: group.colour, variants, sizes: [...new Set(variants.map(variant => String(variant.size)))], productId: group.product.id };
}

export function pendingUploads(preview) {
  const errors = [...preview.errors];
  for (const row of preview.rows) if (row.error) errors.push(row.name + ': ' + row.error);
  for (const row of preview.rows) if (row.status === 'uncertain') errors.push(row.name + ': Check the interrupted upload result before choosing to upload again.');
  const queue = [];
  for (const group of preview.groups.values()) {
    try {
      const target = targetFor(group);
      for (const row of group.rows) if (row.status !== 'uploaded') queue.push({ row, group, target });
    } catch (error) { errors.push(error.message); }
  }
  return { errors, queue: queue.sort((a, b) => comparePhotos(a.row, b.row)) };
}

export function photoAlt(group, row) {
  return String(group.product.name ?? 'HIDI product') + ' · ' + group.colour + ' · Photo ' + String(row.sequence).padStart(3, '0') + ' [' + row.name + ']';
}

export function confirmedAfterFailure(product, target, alt, beforeUrls = []) {
  const before = new Set(beforeUrls);
  const variants = Array.isArray(product?.variants) ? product.variants : [];
  const expected = target.variants?.map(variant => variant.id) ?? [];
  if (!expected.length) return false;
  const firstImages = variants.find(variant => variant.id === expected[0])?.images ?? [];
  return firstImages.some(image => image?.alt === alt && typeof image.url === 'string' && image.url && !before.has(image.url)
    && expected.every(id => (variants.find(variant => variant.id === id)?.images ?? []).some(attached => attached?.alt === alt && attached.url === image.url)));
}

export function csvCell(value) {
  let text = String(value ?? '');
  // Excel interprets a formula after whitespace/control characters too.
  if (/^[\s\u0000-\u001f]*[=+@-]/u.test(text)) text = "'" + text;
  return '"' + text.replace(/"/g, '""') + '"';
}

export function mappingCsv(preview) {
  const headers = ['SKN', 'product_name', 'product_id', 'colour', 'sizes', 'filename', 'photo_number', 'photo_role', 'result', 'message'];
  const rows = preview.rows.map(row => {
    const group = preview.groups.get(row.skn);
    let sizes = '';
    try { sizes = targetFor(group).sizes.join(' / '); } catch { /* Incomplete previews are reportable. */ }
    return [row.skn, group?.product?.name, group?.product?.id, group?.colour, sizes, row.name, row.sequence, row.isMain ? 'Main' : 'Gallery', row.status, row.error || row.message || group?.error];
  });
  return '\ufeff' + [headers, ...rows].map(row => row.map(csvCell).join(',')).join('\r\n');
}

export function catalogueCsv(products) {
  const rows = products.filter(product => product.status !== 'ARCHIVED').map(product => {
    const variants = usableVariants(product).sort(compareVariants);
    return [sknValue(product.skn), product.name, product.id, product.status, product.category?.name,
      [...new Set(variants.map(variant => variant.color))].join(' / '), [...new Set(variants.map(variant => String(variant.size)))].join(' / '),
      variants.map(variant => String(variant.sku ?? '')).filter(Boolean).join(' / '), /^[1-9]\d{4}$/.test(sknValue(product.skn)) ? sknValue(product.skn) + '_001_main.webp' : ''];
  });
  return '\ufeff' + [['SKN', 'product_name', 'product_id', 'status', 'category', 'colours', 'sizes', 'variant_SKUs', 'example_photo_name'], ...rows].map(row => row.map(csvCell).join(',')).join('\r\n');
}
