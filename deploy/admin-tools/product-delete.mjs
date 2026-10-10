const $ = id => document.getElementById(id);
const id = new URLSearchParams(location.search).get('product');
let product, busy = false;
function status(message, bad = false) { $('status').textContent = message; $('status').className = 'notice ' + (bad ? 'bad' : 'good'); }
async function api(method, body) {
  const response = await fetch('/api/hidi/product-deletion/' + encodeURIComponent(id), { method, credentials: 'same-origin', cache: 'no-store', headers: body ? { 'Content-Type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined });
  const data = await response.json();
  if (!response.ok) { if (response.status === 401) $('signin').hidden = false; throw new Error(Array.isArray(data.message) ? data.message.join(' ') : data.message || 'Request failed.'); }
  return data;
}
function updateButton() { $('deleteButton').disabled = busy || $('confirmName').value.trim() !== product?.name; }
async function remove() {
  if (busy || !product) return;
  busy = true; updateButton(); $('retry').disabled = true;
  status('Removing product and cleaning up its photos…');
  try {
    const result = await api('DELETE', { expectedUpdatedAt: product.updatedAt, confirmName: product.name });
    $('deleteForm').hidden = true; $('retry').hidden = result.cleanupComplete; $('done').hidden = !result.cleanupComplete;
    status(result.message, !result.cleanupComplete);
    if (!result.cleanupComplete) $('photos').textContent = result.pendingMediaCount + ' photo references remain for cleanup. Use Retry photo cleanup to finish.';
    else $('photos').textContent = 'Deletion completed. Past order and inventory records are preserved.';
  } catch (e) { status(e.message, true); $('retry').hidden = false; }
  finally { busy = false; updateButton(); $('retry').disabled = false; }
}
$('confirmName').addEventListener('input', updateButton);
$('deleteForm').addEventListener('submit', event => { event.preventDefault(); if (!busy && $('confirmName').value.trim() === product?.name) remove(); });
$('retry').addEventListener('click', () => { if (product?.status === 'DELETED' || $('deleteForm').hidden || $('confirmName').value.trim() === product?.name) remove(); });
try {
  if (!id || !/^[a-zA-Z0-9_-]{1,64}$/.test(id)) throw new Error('Open Delete from the Products list to select a product.');
  product = await api('GET'); $('name').textContent = product.name; $('review').hidden = false;
  if (product.status === 'DELETED') {
    $('deleteForm').hidden = true;
    $('retry').hidden = !product.pendingMediaCount; $('done').hidden = Boolean(product.pendingMediaCount);
    status(product.pendingMediaCount ? 'Product already removed from sale. Finish pending photo cleanup.' : 'This product has already been deleted.');
  } else $('photos').textContent = (product.photoCount || 0) + ' photo references will be reviewed for storage cleanup.';
} catch (e) { status(e.message, true); }
finally { $('loading').hidden = true; }
