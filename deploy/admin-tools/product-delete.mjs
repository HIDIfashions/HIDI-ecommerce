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
  $('retry').hidden = true;
  status('Removing product and cleaning up its photos…');
  let result, previousPending;
  try {
    for (let round = 0; round < 32; round++) {
      result = await api('DELETE', { expectedUpdatedAt: product.updatedAt, confirmName: product.name });
      product.status = 'DELETED'; product.pendingMediaCount = result.pendingMediaCount;
      $('deleteForm').hidden = true; $('done').hidden = !result.cleanupComplete;
      if (result.cleanupComplete) {
        $('photos').textContent = 'Deletion completed. Past order and inventory records are preserved.';
        status(result.message); break;
      }
      const pending = result.pendingMediaCount;
      $('photos').textContent = pending + ' photo references remain for cleanup. Use Retry photo cleanup to finish.';
      // Older handlers omit cleanupBlocked: retain their manual retry contract.
      // Stop on errors, a stalled count or the bounded number of requests.
      const continueCleanup = result.cleanupBlocked === false && Number.isSafeInteger(pending) && pending > 0
        && (previousPending === undefined || pending < previousPending) && round < 31;
      if (!continueCleanup) { $('retry').hidden = false; status(result.message, true); break; }
      previousPending = pending;
      status('Product removed from sale. Cleaning up its remaining photos…');
    }
  } catch (e) {
    status(result ? 'Product removed from sale. Photo cleanup stopped. ' + e.message : e.message, true);
    $('retry').hidden = false;
  }
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
