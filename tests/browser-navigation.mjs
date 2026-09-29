/** Track real route requests across same-document navigation; never filter page errors. */
import { performance } from 'node:perf_hooks';
const trackers = new WeakMap();
export function watchRoutePrefetch(page) {
  if (trackers.has(page)) throw new Error('Route-prefetch tracker already installed');
  const state = { pending: new Set(), changedAt: performance.now() };
  const started = request => {
    let isRoute = false;
    try { isRoute = new URL(request.url()).searchParams.has('_rsc'); } catch { return; }
    if (isRoute) { state.pending.add(request); state.changedAt = performance.now(); }
  };
  const completed = request => {
    if (state.pending.delete(request)) state.changedAt = performance.now();
  };
  page.on('request', started);
  page.on('requestfinished', completed);
  page.on('requestfailed', completed);
  trackers.set(page, state);
  return () => {
    page.off('request', started);
    page.off('requestfinished', completed);
    page.off('requestfailed', completed);
    trackers.delete(page);
  };
}
export async function settleRoutePrefetch(page, { quietMs = 300, timeoutMs = 10000, pollMs = 25 } = {}) {
  const state = trackers.get(page);
  if (!state) throw new Error('Route-prefetch tracker is not installed');
  if (![quietMs, timeoutMs, pollMs].every(Number.isFinite) || quietMs < 0 || timeoutMs <= 0 || pollMs <= 0) throw new RangeError('Invalid prefetch wait bounds');
  const startedAt = performance.now();
  while (state.pending.size || performance.now() - state.changedAt < quietMs) {
    if (performance.now() - startedAt >= timeoutMs) throw new Error(`Unsettled route prefetch: ${state.pending.size} request(s)`);
    await new Promise(done => setTimeout(done, pollMs));
  }
}
