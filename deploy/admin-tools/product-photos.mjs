import { previewPhotos, exactProduct, resolveGroup, targetFor, pendingUploads, photoAlt, confirmedAfterFailure, mappingCsv, catalogueCsv } from './product-photo-match.mjs';
const $ = id => document.getElementById(id);
let preview = null, selectedFiles = [], busy = false, ready = false, stop = false;
const rowElements = new Map();

function say(message, type = '') { $('status').textContent = message; $('status').className = 'notice ' + type; }
function updateButtons() {
  for (const id of ['files', 'folder', 'preview', 'catalogue']) $(id).disabled = busy || !ready;
  document.querySelectorAll('[data-photo-recheck], [data-photo-retry]').forEach(button => button.disabled = busy);
  document.querySelectorAll('[data-photo-colour]').forEach(select => select.disabled = busy || Boolean(preview?.groups.get(select.dataset.photoColour)?.rows.some(row => row.attempted)));
  const checked = preview ? pendingUploads(preview) : { errors: [], queue: [] };
  $('upload').disabled = busy || !ready || checked.errors.length > 0 || !checked.queue.length;
  $('stop').hidden = !busy || !preview;
  $('stop').disabled = stop;
  $('report').disabled = !preview;
}
async function request(path, options = {}) {
  const response = await fetch(path, { credentials: 'same-origin', cache: 'no-store', ...options });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) $('auth').hidden = false;
    const error = new Error(Array.isArray(data.message) ? data.message.join('. ') : data.message || 'Request failed (' + response.status + ').');
    error.status = response.status; throw error;
  }
  return data;
}
async function run(work) {
  if (busy) return;
  busy = true; stop = false; updateButtons();
  try { await work(); } catch (error) { say(error.message, 'bad'); }
  finally { busy = false; updateButtons(); }
}
function rowState(row) {
  const cell = rowElements.get(row);
  if (!cell) return;
  cell.textContent = row.error || row.message || (row.status === 'uploaded' ? 'Uploaded' : 'Pending');
  cell.className = 'photo-state ' + (row.error || ['failed', 'uncertain'].includes(row.status) ? 'bad' : row.status === 'uploaded' ? 'good' : '');
  if (row.status === 'uncertain') {
    const check = document.createElement('button'); check.className = 'secondary'; check.dataset.photoRecheck = ''; check.textContent = 'Check upload result';
    check.onclick = () => void run(async () => {
      const group = preview.groups.get(row.skn), target = targetFor(group);
      const current = await request('/api/admin/products/' + encodeURIComponent(group.product.id));
      if (String(current.skn ?? '') !== group.skn) throw new Error('SKN changed. Check this product in the product editor.');
      if (confirmedAfterFailure(current, target, photoAlt(group, row), row.beforeUrls)) { row.status = 'uploaded'; row.message = 'Uploaded (attachment confirmed for every size).'; group.product = current; }
      else { row.reviewed = true; row.message = 'Attachment could not be confirmed for every size. Review existing product photos before choosing to upload this file again.'; }
      rowState(row); showErrors(); say(row.status === 'uploaded' ? row.name + ' is confirmed uploaded. Resume the remaining photos.' : row.message, row.status === 'uploaded' ? 'good' : 'bad');
    });
    cell.append(document.createElement('br'), check);
    if (row.reviewed) {
      const retry = document.createElement('button'); retry.className = 'secondary'; retry.dataset.photoRetry = ''; retry.textContent = 'I reviewed photos: allow another upload';
      retry.onclick = () => { row.status = 'failed'; row.message = 'Marked for another upload after your review.'; rowState(row); showErrors(); say('Resume to upload this file again. Completed files stay excluded.'); };
      cell.append(document.createElement('br'), retry);
    }
  }
}
function totals() {
  if (!preview) return;
  const uploaded = preview.rows.filter(row => row.status === 'uploaded').length;
  const failed = preview.rows.filter(row => ['failed', 'uncertain'].includes(row.status)).length;
  $('summary').textContent = preview.rows.length + ' photos · ' + preview.groups.size + ' products · ' + uploaded + ' uploaded' + (failed ? ' · ' + failed + ' failed' : '');
  $('progress').max = Math.max(1, preview.rows.length); $('progress').value = uploaded;
  $('progressText').textContent = uploaded + ' of ' + preview.rows.length + ' photos completed.';
  $('upload').textContent = uploaded || failed ? 'Resume remaining photos' : 'Upload matched photos';
}
function showErrors() {
  const errors = pendingUploads(preview).errors;
  $('errors').hidden = !errors.length;
  $('errors').textContent = errors.join('\n');
  totals(); updateButtons();
}
function photoTable(rows) {
  const wrap = document.createElement('div'); wrap.className = 'photo-table-wrap';
  const table = document.createElement('table'); table.className = 'photo-table';
  const caption = document.createElement('caption'); caption.textContent = rows.length + ' selected photo' + (rows.length === 1 ? '' : 's'); table.append(caption);
  const head = document.createElement('thead'), headings = document.createElement('tr');
  for (const text of ['File', 'Role', 'Size', 'Result']) { const th = document.createElement('th'); th.scope = 'col'; th.textContent = text; headings.append(th); }
  head.append(headings); table.append(head); const body = document.createElement('tbody');
  for (const row of rows) {
    const tr = document.createElement('tr');
    for (const [label, text] of [['File', row.name], ['Role', row.isMain ? 'Main / first' : 'Gallery'], ['Size', Number.isFinite(row.size) ? (row.size / (1024 * 1024)).toFixed(2) + ' MB' : 'Invalid']]) { const td = document.createElement('td'); td.dataset.label = label; td.textContent = text; tr.append(td); }
    const state = document.createElement('td'); state.dataset.label = 'Result'; rowElements.set(row, state); tr.append(state); body.append(tr); rowState(row);
  }
  table.append(body); wrap.append(table); return wrap;
}
function renderGroup(group) {
  const card = document.createElement('article'); card.className = 'batch-product photo-product';
  const heading = document.createElement('h3'); heading.textContent = 'SKN ' + group.skn + ' · ' + (group.product?.name || 'No matching product'); card.append(heading);
  if (group.error) { const p = document.createElement('p'); p.className = 'notice bad'; p.textContent = group.error; card.append(p); }
  else {
    const meta = document.createElement('p'); meta.className = 'hint'; meta.textContent = group.product.status + ' · ' + (group.product.category?.name || 'No category'); card.append(meta);
    const fields = document.createElement('div'); fields.className = 'fields'; const label = document.createElement('label'); label.textContent = 'Photo colour for SKN ' + group.skn;
    const select = document.createElement('select'); select.dataset.photoColour = group.skn; select.setAttribute('aria-label', 'Photo colour for SKN ' + group.skn);
    if (group.colours.length > 1) select.append(new Option('Choose a colour before uploading', ''));
    for (const colour of group.colours) select.append(new Option(colour, colour)); select.value = group.colour; label.append(select); fields.append(label);
    const sizes = document.createElement('p'); sizes.className = 'hint photo-sizes';
    const explainSizes = () => { try { const target = targetFor(group); sizes.textContent = 'Shares photos with sizes: ' + target.sizes.join(', ') + ' (' + target.variants.length + ' variants).'; } catch { sizes.textContent = 'Choose which colour these photos show. Every size of that colour receives the same photos.'; } };
    select.onchange = () => { group.colour = select.value; explainSizes(); showErrors(); }; explainSizes(); fields.append(sizes); card.append(fields);
    const link = document.createElement('a'); link.href = '/admin/products/' + encodeURIComponent(group.product.id); link.target = '_blank'; link.rel = 'noopener'; link.textContent = 'Review existing product photos'; card.append(link);
  }
  card.append(photoTable(group.rows)); $('products').append(card);
}
function changed(event) {
  const files = Array.from(event.target.files || []);
  if (preview?.rows.some(row => row.attempted) && !window.confirm('Replace this preview? Download the mapping results first if you need its completed-photo record.')) { event.target.value = ''; return; }
  selectedFiles = files; const other = event.target.id === 'files' ? 'folder' : 'files'; $(other).value = '';
  preview = null; rowElements.clear(); $('review').hidden = true; updateButtons();
  say(files.length ? files.length + ' files selected. Preview every match before uploading.' : 'Choose photos to preview.');
}
$('files').onchange = changed; $('folder').onchange = changed;
$('preview').onclick = () => void run(async () => {
  const next = previewPhotos(selectedFiles);
  if (next.errors.length) throw new Error(next.errors.join(' '));
  say('Checking all selected photos. Nothing is being uploaded.');
  let index = 0;
  for (const group of next.groups.values()) {
    try {
      const result = await request('/api/admin/products?status=ALL&q=' + encodeURIComponent(group.skn));
      const matched = exactProduct(result.items, group.skn);
      resolveGroup(group, await request('/api/admin/products/' + encodeURIComponent(matched.id)));
    } catch (error) { group.error = error.message; if ([401, 403].includes(error.status)) ready = false; }
    say('Checking product ' + (++index) + ' of ' + next.groups.size + '. Nothing is being uploaded.');
  }
  preview = next; rowElements.clear(); $('products').replaceChildren(); $('invalid').replaceChildren();
  [...preview.groups.values()].sort((a, b) => a.skn.localeCompare(b.skn)).forEach(renderGroup);
  const invalid = preview.rows.filter(row => !row.skn);
  if (invalid.length) { const heading = document.createElement('h3'); heading.textContent = 'Files needing a valid SKN name'; $('invalid').append(heading, photoTable(invalid)); }
  $('review').hidden = false; showErrors();
  say(pendingUploads(preview).errors.length ? 'Preview ready. Fix the listed files or choose the required colours before uploading.' : 'Every selected photo has a valid match. Review the products before uploading.');
});
$('stop').onclick = () => { stop = true; $('stop').disabled = true; say('Pausing after the current photo finishes.'); };
$('upload').onclick = () => void run(async () => {
  const checked = pendingUploads(preview);
  if (checked.errors.length) throw new Error('Fix every preview error before uploading.');
  if (!checked.queue.length) throw new Error('All photos in this preview are already uploaded.');
  // Recheck every selected product before the first write, including manual resume.
  for (const group of preview.groups.values()) {
    const product = await request('/api/admin/products/' + encodeURIComponent(group.product.id));
    if (String(product.skn ?? '') !== group.skn) throw new Error('SKN changed for ' + group.skn + '. Preview again before uploading.');
    const oldTarget = targetFor(group); group.product = product;
    const currentTarget = targetFor(group);
    if (currentTarget.variantId !== oldTarget.variantId || currentTarget.variants.map(v => v.id).sort().join() !== oldTarget.variants.map(v => v.id).sort().join()) throw new Error('Size variants changed for SKN ' + group.skn + '. Preview again before uploading.');
  }
  const queue = pendingUploads(preview).queue;
  for (let index = 0; index < queue.length && !stop; index++) {
    const { row, group, target } = queue[index];
    const alt = photoAlt(group, row);
    if (row.attempted && confirmedAfterFailure(group.product, target, alt, row.beforeUrls)) {
      row.status = 'uploaded'; row.message = 'Uploaded (confirmed after interrupted response).'; rowState(row); totals(); continue;
    }
    const currentImages = group.product.variants.find(variant => variant.id === target.variantId)?.images ?? [];
    row.beforeUrls ??= currentImages.map(image => image.url); row.attempted = true; row.reviewed = false; row.status = 'uploading'; row.message = 'Uploading…'; rowState(row);
    say('Uploading ' + row.name + ' to SKN ' + row.skn + ' · ' + target.colour + '.');
    const form = new FormData();
    // Some folder-selected files have an empty MIME type; the validated extension supplies it.
    const file = row.file.type ? row.file : new File([row.file], row.name, { type: row.mime, lastModified: row.file.lastModified });
    form.append('file', file); form.append('applyToColor', 'true'); form.append('isMain', String(row.isMain)); form.append('alt', alt);
    const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 90000);
    try {
      const saved = await request('/api/admin/inventory/' + encodeURIComponent(target.variantId) + '/images', { method: 'POST', body: form, signal: controller.signal });
      if (!saved.id || !Array.isArray(saved.images) || !saved.images.some(image => image.alt === alt)) throw new Error('Upload response is incomplete. Check the product photos, then resume to confirm.');
      row.status = 'uploaded'; row.message = 'Uploaded to all ' + target.variants.length + ' sizes.';
      const variant = group.product.variants.find(variant => variant.id === target.variantId); if (variant) variant.images = saved.images;
    } catch (error) {
      row.status = 'uncertain'; row.message = error.name === 'AbortError' ? 'Upload timed out after 90 seconds. Check the product photos before resuming.' : error.message;
      rowState(row); showErrors(); stop = true;
      say('Batch stopped at ' + row.name + '. ' + row.message + ' Completed photos will be skipped when you manually resume.', 'bad');
      return;
    } finally { clearTimeout(timer); }
    rowState(row); totals();
  }
  say(stop ? 'Batch paused. Resume to upload the remaining photos.' : 'All matched photos uploaded successfully.', stop ? '' : 'good');
});
function download(name, csv) { const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' })); const link = document.createElement('a'); link.href = url; link.download = name; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
$('report').onclick = () => { if (preview) download('hidi-skn-photo-mapping.csv', mappingCsv(preview)); };
$('catalogue').onclick = () => void run(async () => {
  const items = [], seen = new Set(); let expected = null, page = 1;
  for (;;) {
    const result = await request('/api/admin/products?status=ALL&page=' + page);
    if (!Array.isArray(result.items) || !Number.isInteger(result.total) || result.total < 0) throw new Error('Catalogue response is incomplete. No CSV was downloaded.');
    if (expected === null) expected = result.total;
    if (result.total !== expected) throw new Error('Catalogue changed while loading. Download again to get a complete mapping.');
    if (expected > 5000) throw new Error('Catalogue exceeds 5,000 products. Ask for an expanded export before downloading the full SKN mapping.');
    for (const item of result.items) { if (!item.id || seen.has(item.id)) throw new Error('Catalogue pagination repeated a product. No partial CSV was downloaded.'); seen.add(item.id); items.push(item); }
    if (items.length > expected || (!result.items.length && items.length < expected)) throw new Error('Catalogue pagination is incomplete. No partial CSV was downloaded.');
    if (items.length === expected) break;
    say('Loading product SKNs: ' + items.length + ' of ' + expected + '.'); page++;
  }
  const products = []; let archived = 0;
  for (const item of items) {
    if (item.status === 'ARCHIVED') { archived++; continue; }
    const product = await request('/api/admin/products/' + encodeURIComponent(item.id));
    if (!product.id || product.id !== item.id || String(product.skn ?? '') !== String(item.skn ?? '')) throw new Error('Product mapping changed while loading. Download again; no partial CSV was downloaded.');
    if (product.status === 'ARCHIVED') { archived++; continue; }
    products.push(product); say('Preparing product SKNs: ' + products.length + ' products.');
  }
  download('hidi-product-skn-catalogue.csv', catalogueCsv(products));
  say('Downloaded SKN mapping for ' + products.length + ' draft/active products' + (archived ? '; ' + archived + ' archived products excluded.' : '.'), 'good');
});
window.addEventListener('beforeunload', event => { if (busy || preview?.rows.some(row => row.attempted && row.status !== 'uploaded')) { event.preventDefault(); event.returnValue = ''; } });
void run(async () => { await request('/api/admin/products/options'); ready = true; say('Ready. Choose photos named with the SKNs from your product import.'); });
