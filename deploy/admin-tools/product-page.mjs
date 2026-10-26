import { FACTS, MEASUREMENTS, readFields, detailsPayload, variantPayload, cm, gallery, contentGaps } from './product-page-model.mjs';
const $ = id => document.getElementById(id);
let product = null, options = null, busy = false, dirty = false, skuDirty = false, uncertain = false, ready = false;
const details = $('detailsForm'), variantForm = $('variantForm');
const field = name => details.elements.namedItem(name);
const skuField = name => variantForm.elements.namedItem(name);
const selectedVariant = () => product?.variants.find(v => v.id === $('variant').value);
function say(message, type = '') { $('status').textContent = message; $('status').className = type; }
function synchronize() {
  const blocked = busy || !ready || uncertain;
  $('detailsFields').disabled = blocked || skuDirty;
  $('variantFields').disabled = blocked || dirty;
  $('saveDetails').disabled = blocked || !product || !dirty || skuDirty;
  $('saveVariant').disabled = blocked || !product || !skuDirty || dirty;
  $('photos').disabled = blocked || !product || dirty || skuDirty;
  $('galleryColor').disabled = blocked || dirty || skuDirty;
  $('variant').disabled = blocked || dirty || skuDirty;
  $('search').disabled = blocked;
  $('searchButton').disabled = blocked;
  // Reload is the recovery path after an uncertain write or expired session.
  $('reload').disabled = busy || !product;
  for (const [id, status] of [['publish', 'ACTIVE'], ['draft', 'DRAFT'], ['archive', 'ARCHIVED']]) { $(id).disabled = blocked || !product || dirty || skuDirty; $(id).hidden = product?.status === status; }
  document.querySelectorAll('[data-remove-photo], #results button').forEach(button => button.disabled = blocked || dirty || skuDirty);
  $('saveState').textContent = dirty ? 'Unsaved product fields' : 'Saved values loaded';
  $('variantState').textContent = skuDirty ? 'Unsaved SKU changes' : 'No pending SKU changes';
}
async function request(path, init = {}) {
  const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), init.body instanceof FormData ? 90000 : 30000);
  let response, body;
  try {
    response = await fetch(path, { credentials: 'same-origin', cache: 'no-store', ...init, signal: controller.signal });
    body = await response.json();
  } catch {
    if (init.method && init.method !== 'GET') { uncertain = true; throw new Error('The save result could not be confirmed. Reload saved values before retrying; the server may have completed it.'); }
    throw new Error('Unable to load the saved values. Try again.');
  } finally { clearTimeout(timeout); }
  if (!response.ok) {
    if ([401, 403].includes(response.status)) { ready = false; $('auth').hidden = false; }
    if (response.status >= 500 && init.method && init.method !== 'GET') uncertain = true;
    const message = Array.isArray(body.message) ? body.message.join('. ') : body.message;
    throw new Error((message || 'Request failed (' + response.status + ').') + (uncertain ? ' Reload saved values before retrying.' : ''));
  }
  return body;
}
const api = (path, method = 'GET', body) => request('/api/admin/products' + path, { method, ...(body === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }) });
async function run(work) {
  if (busy) return;
  busy = true; say('Working…'); synchronize();
  try { await work(); } catch (error) { say(error.message, 'error'); }
  finally { busy = false; synchronize(); }
}
function values() {
  const result = {};
  for (const key of ['name', 'shortDescription', 'description', 'fabric', 'care', 'categoryId', ...FACTS.map(fact => fact.key)]) result[key] = field(key).value;
  result.collectionIds = [...$('collections').querySelectorAll('input:checked')].map(input => input.value);
  return result;
}
function makeOption(value, label) { const node = document.createElement('option'); node.value = value; node.textContent = label; return node; }
function fillSku() {
  const v = selectedVariant(); if (!v) return;
  skuField('price').value = (v.pricePaise / 100).toFixed(2); skuField('mrp').value = (v.mrpPaise / 100).toFixed(2);
  skuField('weight').value = v.weightGrams ?? ''; skuField('active').checked = v.active;
  for (const [key] of MEASUREMENTS) skuField(key).value = cm(v[key]);
  $('skuIdentity').textContent = v.sku + ' · ' + v.color + ' / ' + v.size;
  $('stock').textContent = (v.inventory?.onHand ?? 0) + ' on hand · ' + (v.inventory?.reserved ?? 0) + ' reserved. Receive Stock controls warehouse quantities.';
  skuDirty = false;
}
function accept(record) {
  if (!record?.id || !Array.isArray(record.variants) || !record.updatedAt) { uncertain = true; throw new Error('The server returned incomplete saved values. Reload before continuing.'); }
  const oldColor = $('galleryColor').value, oldSku = $('variant').value;
  product = record; dirty = false; skuDirty = false; uncertain = false;
  const fields = readFields(record);
  for (const [key, value] of Object.entries(fields)) if (key !== 'collectionIds') field(key).value = value;
  const categories = [...options.categories];
  if (record.category && !categories.some(c => c.id === record.categoryId)) categories.push(record.category);
  field('categoryId').replaceChildren(makeOption('', 'Uncategorised'), ...categories.map(c => makeOption(c.id, c.name)));
  field('categoryId').value = fields.categoryId;
  const collections = [...options.collections];
  for (const item of record.collections) if (!collections.some(c => c.id === item.collectionId)) collections.push(item.collection);
  $('collections').replaceChildren(...collections.map(c => { const label = document.createElement('label'), input = document.createElement('input'); input.type = 'checkbox'; input.value = c.id; input.checked = fields.collectionIds.includes(c.id); label.append(input, document.createTextNode(c.name)); return label; }));
  $('identity').textContent = (record.skn ? 'SKN ' + record.skn + ' · ' : '') + record.status + ' · ' + record.name;
  $('publicationState').textContent = record.status === 'ACTIVE' ? 'Active: saved content is visible to customers.' : record.status + ': hidden from the storefront.';
  $('productUrl').value = '/products/' + record.slug;
  $('customerLink').href = '/products/' + encodeURIComponent(record.slug); $('customerLink').hidden = record.status !== 'ACTIVE';
  $('nativeLink').href = '/admin/products/' + encodeURIComponent(record.id);
  $('variant').replaceChildren(...record.variants.map(v => makeOption(v.id, v.color + ' / ' + v.size + (v.active ? '' : ' (disabled)'))));
  if (record.variants.some(v => v.id === oldSku)) $('variant').value = oldSku;
  const colors = [...new Set(record.variants.map(v => v.color))];
  $('galleryColor').replaceChildren(...colors.map(color => makeOption(color, color)));
  if (colors.includes(oldColor)) $('galleryColor').value = oldColor;
  fillSku(); renderGallery(); renderPreview();
  $('workspace').hidden = false; synchronize();
  history.replaceState(null, '', '?product=' + encodeURIComponent(record.id));
}
function safeImage(url) { try { const parsed = new URL(url, location.href); return ['http:', 'https:'].includes(parsed.protocol) ? parsed.href : ''; } catch { return ''; } }
function renderGallery() {
  const color = $('galleryColor').value, photos = gallery(product, color);
  $('gallery').replaceChildren();
  if (!photos.length) { const empty = document.createElement('p'); empty.className = 'empty-photo'; empty.textContent = 'No photos published for this colour'; $('gallery').append(empty); }
  for (const photo of photos) {
    const figure = document.createElement('figure'), img = document.createElement('img'), caption = document.createElement('figcaption');
    const source = safeImage(photo.url); if (source) img.src = source;
    img.alt = photo.alt || product.name + ' · ' + color; img.loading = 'lazy';
    caption.textContent = photo.alt || 'Product photograph'; figure.append(img, caption);
    const owner = product.variants.find(v => v.color === color && v.images.some(image => image.id === photo.id));
    if (owner) {
      const button = document.createElement('button'); button.type = 'button'; button.className = 'secondary'; button.dataset.removePhoto = photo.id; button.textContent = 'Remove from this colour';
      button.onclick = () => {
        if (dirty || skuDirty || !window.confirm('Remove this photo from all existing ' + color + ' sizes?')) return;
        void run(async () => {
          const query = new URLSearchParams({ imageId: photo.id, applyToColor: 'true' });
          await request('/api/admin/inventory/' + encodeURIComponent(owner.id) + '/images?' + query, { method: 'DELETE' });
          await refreshAfterWrite(); say('Photo removed from this colour.', 'success');
        });
      };
      figure.append(button);
    } else { const hint = document.createElement('small'); hint.textContent = 'Shared product photo'; figure.append(hint); }
    $('gallery').append(figure);
  }
  synchronize();
}
function addRows(target, rows) {
  target.replaceChildren(...rows.filter(([, value]) => value).map(([label, value]) => { const row = document.createElement('div'), dt = document.createElement('dt'), dd = document.createElement('dd'); dt.textContent = label; dd.textContent = value; row.append(dt, dd); return row; }));
}
function renderPreview() {
  if (!product) return;
  const f = values(), color = $('galleryColor').value;
  $('previewName').textContent = f.name; $('previewShort').textContent = f.shortDescription; $('previewDescription').textContent = f.description;
  const variants = product.variants.filter(v => v.active && v.color === color), minPrice = Math.min(...variants.map(v => v.pricePaise));
  $('previewPrice').textContent = variants.length ? new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(minPrice / 100) + ' · inclusive of taxes' : 'No enabled sizes';
  $('previewColor').textContent = color;
  $('previewSizes').replaceChildren(...variants.map(v => { const node = document.createElement('span'); node.textContent = v.size; return node; }));
  const rows = [['Fabric / composition', f.fabric], ['Colour', color], ...FACTS.map(fact => [fact.label, f[fact.key]]), ['Care', f.care]];
  addRows($('previewFacts'), rows); addRows($('previewSpecifications'), rows.filter(([label]) => !['Fabric / composition', 'Care'].includes(label)));
  $('previewMaterial').textContent = 'Fabric: ' + (f.fabric || 'Fabric information is not published for this style yet.');
  $('previewCare').textContent = 'Care: ' + (f.care || 'Follow the care label attached to the garment.');
  const gaps = contentGaps(product, f); $('gaps').textContent = gaps.length ? 'Information to complete: ' + gaps.join(' · ') : 'Product content and verified size measurements are complete.';
}
async function refreshAfterWrite() {
  try { accept(await api('/' + encodeURIComponent(product.id))); }
  catch (error) { uncertain = true; throw new Error('The change was submitted, but saved values could not refresh. Reload before retrying. ' + error.message); }
}
for (const group of [...new Set(FACTS.map(fact => fact.group))]) {
  const section = document.createElement('fieldset'), legend = document.createElement('legend'), grid = document.createElement('div');
  section.className = 'detail-group'; legend.textContent = group; grid.className = 'detail-grid'; section.append(legend, grid);
  for (const fact of FACTS.filter(item => item.group === group)) {
    const label = document.createElement('label'), input = document.createElement('input');
    label.textContent = fact.label; input.name = fact.key; input.maxLength = 1000; input.placeholder = fact.placeholder || 'Optional — choose or type';
    label.append(input);
    grid.append(label);
    if (fact.choices.length) { const list = document.createElement('datalist'); list.id = 'choices-' + fact.key; input.setAttribute('list', list.id); list.replaceChildren(...fact.choices.map(value => makeOption(value,value))); grid.append(list); }
  }
  $('facts').append(section);
}
for (const [key, text] of MEASUREMENTS) { const label = document.createElement('label'), input = document.createElement('input'); label.textContent = text + ' (cm)'; input.name = key; input.inputMode = 'decimal'; input.placeholder = key === 'bustMm' ? '101.6' : 'Verified measurement'; label.append(input); $('measurements').append(label); }
details.addEventListener('input', () => { dirty = true; renderPreview(); synchronize(); });
details.addEventListener('change', () => { dirty = true; renderPreview(); synchronize(); });
variantForm.addEventListener('input', () => { skuDirty = true; synchronize(); });
variantForm.addEventListener('change', () => { skuDirty = true; synchronize(); });
$('galleryColor').onchange = () => { renderGallery(); renderPreview(); };
$('variant').onchange = () => { fillSku(); synchronize(); };
details.onsubmit = event => { event.preventDefault(); if (!dirty || skuDirty || uncertain) return; void run(async () => { const body = detailsPayload(product, values()); accept(await api('/' + encodeURIComponent(product.id), 'PATCH', body)); say('Product fields saved. ' + (product.status === 'ACTIVE' ? 'The active storefront uses these values.' : 'Product remains ' + product.status + '.'), 'success'); }); };
variantForm.onsubmit = event => { event.preventDefault(); if (!skuDirty || dirty || uncertain) return; void run(async () => { const v = selectedVariant(), values = { price: skuField('price').value, mrp: skuField('mrp').value, weight: skuField('weight').value, active: skuField('active').checked }; for (const [key] of MEASUREMENTS) values[key] = skuField(key).value; accept(await api('/' + encodeURIComponent(product.id) + '/variants/' + encodeURIComponent(v.id), 'PATCH', variantPayload(product, values))); say('SKU price and fit saved.', 'success'); }); };
$('reload').onclick = () => { if ((dirty || skuDirty) && !window.confirm('Discard unsaved fields and load the saved product?')) return; void run(async () => { options = await api('/options'); ready = true; $('auth').hidden = true; accept(await api('/' + encodeURIComponent(product.id))); say('Latest saved values loaded.', 'success'); }); };
$('searchForm').onsubmit = event => { event.preventDefault(); if ((dirty || skuDirty) && !window.confirm('Discard unsaved fields to select another product?')) return; void run(async () => { const result = await api('?q=' + encodeURIComponent($('search').value.trim()) + '&status=ALL'); $('results').replaceChildren(...result.items.map(item => { const button = document.createElement('button'); button.type = 'button'; button.className = 'secondary'; button.textContent = item.name + ' · ' + item.status; button.onclick = () => void run(async () => { if ((dirty || skuDirty) && !window.confirm('Discard unsaved fields and open this product?')) return; accept(await api('/' + encodeURIComponent(item.id))); say('Saved product loaded.'); }); return button; })); say(result.items.length ? 'Choose a product below.' : 'No matching products.'); }); };
function mode(preview) { $('detailsForm').hidden = preview; $('preview').hidden = !preview; $('skuSection').hidden = preview; $('photoControls').hidden = preview; $('editMode').setAttribute('aria-pressed', String(!preview)); $('previewMode').setAttribute('aria-pressed', String(preview)); renderPreview(); }
$('previewMode').onclick = () => mode(true); $('editMode').onclick = () => mode(false);
for (const [id, status] of [['publish', 'ACTIVE'], ['draft', 'DRAFT'], ['archive', 'ARCHIVED']]) $(id).onclick = () => {
  if (!product || dirty || skuDirty || uncertain || !window.confirm(status === 'ACTIVE' ? 'Publish this saved product to the storefront?' : 'Move this product to ' + status.toLowerCase() + ' and hide it from the storefront?')) return;
  void run(async () => { accept(await api('/' + encodeURIComponent(product.id) + '/status', 'POST', { status, expectedUpdatedAt: product.updatedAt })); say('Publication status saved: ' + product.status + '.', 'success'); });
};
$('photos').onchange = event => {
  const input = event.target, files = [...input.files]; if (!files.length || dirty || skuDirty || uncertain) return;
  void run(async () => {
    for (const file of files) if (!['image/jpeg', 'image/png', 'image/webp', 'image/avif'].includes(file.type) || file.size < 1) throw new Error(file.name + ': use a non-empty JPEG, PNG, WebP or AVIF photo. Nothing was uploaded.');
    const color = $('galleryColor').value, owner = product.variants.find(v => v.color === color && v.active) || product.variants.find(v => v.color === color);
    if (!owner) throw new Error('Add a colour and size before uploading photos.');
    let uploaded = 0;
    try {
      for (const file of files) { say('Uploading ' + (uploaded + 1) + ' of ' + files.length + ' · ' + file.name); const form = new FormData(); form.set('file', file); form.set('applyToColor', 'true'); form.set('alt', product.name + ' · ' + color); await request('/api/admin/inventory/' + encodeURIComponent(owner.id) + '/images', { method: 'POST', body: form }); uploaded++; }
    } catch (error) { uncertain = true; throw new Error(uploaded + ' of ' + files.length + ' photos confirmed saved. ' + error.message + ' Check the gallery before reselecting files.'); }
    await refreshAfterWrite(); input.value = ''; say(uploaded + ' photos saved to all existing ' + color + ' sizes.', 'success');
  });
};
window.addEventListener('beforeunload', event => { if (dirty || skuDirty || busy) { event.preventDefault(); event.returnValue = ''; } });
void run(async () => { options = await api('/options'); ready = true; const id = new URL(location.href).searchParams.get('product'); if (id) { if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) throw new Error('Choose a valid product from Products.'); accept(await api('/' + encodeURIComponent(id))); say('Saved product loaded.'); } else say('Search for the product to edit.'); });
