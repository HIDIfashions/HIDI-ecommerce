import assert from 'node:assert/strict';
import {mkdir, writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';

const SAFE_METHODS = new Set(['GET', 'HEAD']);
const VIEWPORT = {width: 390, height: 844};
export const DESTINATION_TIMEOUT_MS = 45_000;
const MAX_EVENTS = 4_000;
const ORIGINAL_HISTORY = [
  '/', '/collections/all', '$product', '/cart', '/checkout',
  '/collections/work-wear', '/collections/casual-wear',
  '/collections/occasional-wear', '/collections/ananyas-pick',
  '/about', '/shipping', '/returns', '/contact', '/offers',
];

const now = () => new Date().toISOString();
const cleanName = value => value.replace(/[^a-z0-9_-]+/gi, '-').replace(/^-|-$/g, '');
const errorValue = error => error ? {name: error.name, message: error.message, stack: error.stack} : null;

export function classifyFirefoxNavigation(attempts, directControl) {
  if (!directControl?.passed) return 'destination-or-browser-document-control-failed';
  if (attempts.some(item => item.infrastructureError)) return 'diagnostic-infrastructure-error';
  const exact = attempts.filter(item => item.precondition === 'original-history');
  const cold = attempts.filter(item => item.precondition === 'cold');
  if (exact.some(item => item.navigated) && exact.some(item => !item.navigated)) return 'intermittent-original-history-navigation';
  const coldImmediatePointer = cold.filter(item => item.activation === 'pointer' && !item.settle);
  const coldSettledPointer = cold.filter(item => item.activation === 'pointer' && item.settle);
  const coldSettledNonPointer = cold.filter(item => item.settle && ['keyboard', 'dom-click'].includes(item.activation));
  if (coldImmediatePointer.some(item => !item.navigated) && coldSettledPointer.some(item => item.navigated)) return 'hydration-timing-sensitive-navigation';
  if (coldSettledPointer.length && coldSettledPointer.every(item => !item.navigated) && coldSettledNonPointer.some(item => item.navigated)) return 'pointer-activation-specific-navigation';
  if (exact.some(item => !item.navigated) && cold.some(item => item.navigated)) return 'history-or-timing-sensitive-navigation';
  if (attempts.length && attempts.every(item => !item.navigated)) return 'link-activation-defect-reproduced';
  if (attempts.every(item => item.navigated)) return 'not-reproduced-on-recovered-live-baseline';
  return 'partial-navigation-failure';
}

function pushBounded(list, value) {
  if (list.length < MAX_EVENTS) list.push(value);
}

async function installDomRecorder(context, domEvents) {
  await context.exposeBinding('__hidiRecordNavigationEvent', (_source, value) => {
    pushBounded(domEvents, {...value, receivedAt: now()});
  });
  await context.addInitScript(() => {
    const describe = node => {
      const element = node instanceof Element ? node : null;
      const anchor = element?.closest?.('a');
      return {
        tag: element?.tagName || null,
        id: element?.id || null,
        className: typeof element?.className === 'string' ? element.className.slice(0, 240) : null,
        text: element?.textContent?.trim().replace(/\s+/g, ' ').slice(0, 180) || null,
        href: anchor?.getAttribute('href') || null,
      };
    };
    const record = (type, detail = {}) => {
      const value = {type, at: Date.now(), location: location.href, ...detail};
      globalThis.__hidiNavigationEvents ||= [];
      if (globalThis.__hidiNavigationEvents.length < 500) globalThis.__hidiNavigationEvents.push(value);
      try { void globalThis.__hidiRecordNavigationEvent(value); } catch {}
    };
    for (const type of ['pointerdown', 'pointerup', 'touchstart', 'touchend', 'mousedown', 'mouseup', 'click', 'keydown', 'keyup', 'submit']) {
      addEventListener(type, event => record(`dom:${type}:capture`, {
        target: describe(event.target), phase: event.eventPhase, trusted: event.isTrusted,
        defaultPrevented: event.defaultPrevented, button: event.button ?? null,
        buttons: event.buttons ?? null, key: event.key ?? null,
        pointerType: event.pointerType ?? null,
      }), true);
      addEventListener(type, event => record(`dom:${type}:bubble`, {
        target: describe(event.target), phase: event.eventPhase, trusted: event.isTrusted,
        defaultPrevented: event.defaultPrevented, button: event.button ?? null,
        buttons: event.buttons ?? null, key: event.key ?? null,
        pointerType: event.pointerType ?? null,
      }));
    }
    for (const type of ['beforeunload', 'pagehide', 'pageshow', 'popstate', 'hashchange', 'visibilitychange']) {
      addEventListener(type, event => record(`window:${type}`, {
        persisted: event.persisted ?? null,
        visibility: document.visibilityState,
      }));
    }
    for (const name of ['pushState', 'replaceState']) {
      const original = history[name];
      history[name] = function (...args) {
        const before = location.href;
        const result = Reflect.apply(original, this, args);
        record(`history:${name}`, {before, after: location.href, target: String(args[2] ?? '')});
        return result;
      };
    }
    record('document:init', {readyState: document.readyState});
  });
}

function requestHeaders(request) {
  const headers = request.headers();
  return Object.fromEntries(['accept', 'rsc', 'next-router-prefetch', 'next-router-segment-prefetch', 'next-router-state-tree', 'purpose', 'sec-purpose']
    .filter(name => headers[name] !== undefined).map(name => [name, headers[name]]));
}

function relevantRequest(request, targetHost) {
  const url = new URL(request.url());
  return request.isNavigationRequest() || ['document', 'fetch', 'xhr'].includes(request.resourceType()) ||
    (url.hostname === targetHost && /\/(?:products|collections|api|_next)\//.test(url.pathname));
}

async function instrumentContext(context, targetHost, state) {
  await context.route('**/*', async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (!SAFE_METHODS.has(request.method())) {
      pushBounded(state.blockedMutationAttempts, {
        at: now(), method: request.method(), url: request.url(), resourceType: request.resourceType(),
      });
      await route.abort('blockedbyclient');
      return;
    }
    if (url.hostname === 'static.cloudflareinsights.com' || request.resourceType() === 'media' ||
      /google-analytics|googletagmanager|facebook\.net/.test(url.hostname)) {
      pushBounded(state.blockedTelemetryAndMedia, {at: now(), method: request.method(), url: request.url(), resourceType: request.resourceType()});
      await route.abort('blockedbyclient');
      return;
    }
    await route.continue();
  });
  await installDomRecorder(context, state.domEvents);
}

function instrumentPage(page, targetHost, state) {
  const ids = new WeakMap();
  const starts = new WeakMap();
  let nextId = 0;
  const idFor = request => {
    if (!ids.has(request)) ids.set(request, ++nextId);
    return ids.get(request);
  };
  page.on('request', request => {
    if (!relevantRequest(request, targetHost)) return;
    starts.set(request, Date.now());
    pushBounded(state.networkEvents, {
      type: 'request', at: now(), id: idFor(request), method: request.method(), url: request.url(),
      resourceType: request.resourceType(), navigation: request.isNavigationRequest(), headers: requestHeaders(request),
    });
  });
  page.on('requestfinished', request => {
    if (!relevantRequest(request, targetHost)) return;
    pushBounded(state.networkEvents, {type: 'requestfinished', at: now(), id: idFor(request), url: request.url(), elapsedMs: starts.has(request) ? Date.now() - starts.get(request) : null});
  });
  page.on('requestfailed', request => {
    if (!relevantRequest(request, targetHost)) return;
    pushBounded(state.networkEvents, {
      type: 'requestfailed', at: now(), id: idFor(request), url: request.url(), failure: request.failure(),
      elapsedMs: starts.has(request) ? Date.now() - starts.get(request) : null,
    });
  });
  page.on('response', response => {
    const request = response.request();
    if (!relevantRequest(request, targetHost)) return;
    state.pendingResponseReads.push((async () => {
      const headers = await response.allHeaders().catch(() => ({}));
      pushBounded(state.networkEvents, {
        type: 'response', at: now(), id: idFor(request), url: response.url(), status: response.status(),
        fromServiceWorker: response.fromServiceWorker(), elapsedMs: starts.has(request) ? Date.now() - starts.get(request) : null,
        headers: Object.fromEntries(['content-type', 'location', 'vary', 'cache-control', 'cf-cache-status', 'server-timing', 'x-azure-ref']
          .filter(name => headers[name] !== undefined).map(name => [name, headers[name]])),
      });
    })());
  });
  page.on('framenavigated', frame => {
    if (frame === page.mainFrame()) pushBounded(state.pageEvents, {type: 'framenavigated', at: now(), url: frame.url()});
  });
  page.on('domcontentloaded', () => pushBounded(state.pageEvents, {type: 'domcontentloaded', at: now(), url: page.url()}));
  page.on('load', () => pushBounded(state.pageEvents, {type: 'load', at: now(), url: page.url()}));
  page.on('console', message => {
    if (['warning', 'error'].includes(message.type())) pushBounded(state.consoleEvents, {type: message.type(), at: now(), text: message.text(), url: page.url()});
  });
  page.on('pageerror', error => pushBounded(state.pageErrors, {at: now(), url: page.url(), ...errorValue(error)}));
}

async function waitForDestination(page, destinationPath, timeoutMs = DESTINATION_TIMEOUT_MS) {
  const started = Date.now();
  const observed = [];
  let previous = null;
  while (Date.now() - started < timeoutMs) {
    const current = page.url();
    if (current !== previous) {
      observed.push({atMs: Date.now() - started, url: current});
      previous = current;
    }
    try {
      if (new URL(current).pathname === destinationPath) return {navigated: true, elapsedMs: Date.now() - started, observed};
    } catch {}
    await page.waitForTimeout(200);
  }
  return {navigated: false, elapsedMs: Date.now() - started, observed};
}

async function linkSnapshot(page, selector) {
  return page.locator(selector).first().evaluate(element => {
    const rect = element.getBoundingClientRect();
    const point = {x: rect.x + rect.width / 2, y: rect.y + rect.height / 2};
    const chain = document.elementsFromPoint(point.x, point.y).slice(0, 8).map(node => ({
      tag: node.tagName, id: node.id || null,
      className: typeof node.className === 'string' ? node.className.slice(0, 240) : null,
      href: node.closest?.('a')?.getAttribute('href') || null,
      pointerEvents: getComputedStyle(node).pointerEvents,
    }));
    const style = getComputedStyle(element);
    return {
      href: element.getAttribute('href'), resolvedHref: element.href, outerHTML: element.outerHTML.slice(0, 2_000),
      rect: {x: rect.x, y: rect.y, width: rect.width, height: rect.height, right: rect.right, bottom: rect.bottom},
      point, hitChain: chain, display: style.display, visibility: style.visibility, pointerEvents: style.pointerEvents,
      readyState: document.readyState, visibilityState: document.visibilityState,
      activeElement: document.activeElement?.outerHTML?.slice(0, 500) || null,
      nextFlightQueueLength: Array.isArray(globalThis.__next_f) ? globalThis.__next_f.length : null,
      nextDataPresent: !!document.querySelector('#__NEXT_DATA__'),
    };
  });
}

async function visit(page, base, path, {settle = false} = {}) {
  const response = await page.goto(base + path, {waitUntil: 'domcontentloaded'});
  assert(response?.ok(), `GET ${path} returned ${response?.status()}`);
  await page.locator('footer.site-footer, footer.footer').first().waitFor({state: 'attached'});
  if (settle) {
    await page.waitForLoadState('load').catch(() => {});
    await page.waitForFunction(() => document.fonts?.status === 'loaded', null, {timeout: 30_000}).catch(() => {});
    await page.waitForTimeout(1_000);
  }
}

async function prepareOriginalHistory(page, base) {
  let productPath;
  for (const path of ORIGINAL_HISTORY) {
    let destination = path;
    if (path === '$product') {
      const link = page.locator('main article h3 a').first();
      await link.waitFor({state: 'visible'});
      productPath = await link.getAttribute('href');
      assert(productPath?.startsWith('/products/'), 'Warm-up collection exposes a product destination');
      destination = productPath;
    }
    await visit(page, base, destination, {settle: true});
    await page.evaluate(() => {
      document.documentElement.style.scrollBehavior = 'auto';
      scrollTo(0, document.documentElement.scrollHeight);
    });
    await page.waitForTimeout(300);
  }
  await visit(page, base, '/collections/all');
  return productPath;
}

async function runAttempt(pw, base, output, specification) {
  const state = {
    networkEvents: [], pendingResponseReads: [], pageEvents: [], domEvents: [], consoleEvents: [], pageErrors: [],
    blockedMutationAttempts: [], blockedTelemetryAndMedia: [],
  };
  const browser = await pw.firefox.launch({headless: true, env: {...process.env, MOZ_DISABLE_CONTENT_SANDBOX: '1'}});
  const context = await browser.newContext({
    viewport: VIEWPORT, hasTouch: true, reducedMotion: 'reduce',
    extraHTTPHeaders: {'x-forwarded-host': 'hidiindia.com', 'x-forwarded-proto': 'https'},
  });
  const attemptDirectory = `${output}/${cleanName(specification.name)}`;
  await mkdir(attemptDirectory, {recursive: true});
  await context.tracing.start({screenshots: true, snapshots: true, sources: true});
  await instrumentContext(context, new URL(base).hostname, state);
  const page = await context.newPage();
  page.setDefaultTimeout(45_000);
  instrumentPage(page, new URL(base).hostname, state);
  const attempt = {
    ...specification, startedAt: now(), viewport: VIEWPORT, browser: 'firefox',
    navigated: false, liveWrites: 0,
  };
  try {
    if (specification.precondition === 'original-history') await prepareOriginalHistory(page, base);
    else await visit(page, base, '/collections/all', {settle: specification.settle});
    const selector = 'main article h3 a';
    const link = page.locator(selector).first();
    await link.waitFor({state: 'visible'});
    await link.scrollIntoViewIfNeeded();
    await page.waitForTimeout(100);
    attempt.before = await linkSnapshot(page, selector);
    const destination = new URL(attempt.before.href, base);
    assert.equal(destination.origin, new URL(base).origin, 'Product link remains on the storefront origin');
    assert.match(destination.pathname, /^\/products\/[a-z0-9][a-z0-9-]*$/, 'Product link has a canonical product path');
    attempt.destination = destination.href;
    const directStarted = Date.now();
    const directResponse = await fetch(destination, {
      method: 'HEAD', redirect: 'manual', signal: AbortSignal.timeout(45_000),
      headers: {'user-agent': 'HIDI-Firefox-Navigation-Diagnostic/1.0'},
    });
    attempt.destinationHead = {status: directResponse.status, elapsedMs: Date.now() - directStarted, contentType: directResponse.headers.get('content-type')};
    assert.equal(directResponse.status, 200, 'Product HEAD control is healthy');
    await page.screenshot({path: `${attemptDirectory}/before.png`});
    const activationStarted = Date.now();
    try {
      if (specification.activation === 'keyboard') {
        await link.focus();
        await link.press('Enter', {noWaitAfter: true, timeout: 15_000});
      } else if (specification.activation === 'dom-click') {
        await link.evaluate(element => element.click());
      } else {
        await link.click({noWaitAfter: true, timeout: 15_000});
      }
      attempt.activationResult = {completed: true, elapsedMs: Date.now() - activationStarted};
    } catch (error) {
      attempt.activationResult = {completed: false, elapsedMs: Date.now() - activationStarted, error: errorValue(error)};
    }
    Object.assign(attempt, await waitForDestination(page, destination.pathname));
    attempt.finalUrl = page.url();
    attempt.after = await page.evaluate(() => ({
      href: location.href, title: document.title, readyState: document.readyState,
      canonical: document.querySelector('link[rel="canonical"]')?.href || null,
      h1: document.querySelector('h1')?.textContent?.trim() || null,
      localEvents: globalThis.__hidiNavigationEvents || [],
    })).catch(error => ({error: errorValue(error)}));
    await page.screenshot({path: `${attemptDirectory}/after.png`}).catch(() => {});
    if (!attempt.navigated) {
      await writeFile(`${attemptDirectory}/failure-body.txt`, `${page.url()}\n${await page.locator('body').innerText().catch(() => '')}\n`);
      await writeFile(`${attemptDirectory}/failure-page.html`, await page.content().catch(() => ''));
    }
  } catch (error) {
    attempt.infrastructureError = errorValue(error);
    attempt.finalUrl = page.url();
    await page.screenshot({path: `${attemptDirectory}/infrastructure-failure.png`}).catch(() => {});
  } finally {
    await Promise.allSettled(state.pendingResponseReads);
    attempt.completedAt = now();
    attempt.events = {
      page: state.pageEvents, dom: state.domEvents, network: state.networkEvents,
      console: state.consoleEvents, pageErrors: state.pageErrors,
      blockedMutationAttempts: state.blockedMutationAttempts,
      blockedTelemetryAndMedia: state.blockedTelemetryAndMedia,
    };
    await writeFile(`${attemptDirectory}/attempt.json`, JSON.stringify(attempt, null, 2) + '\n');
    await context.tracing.stop({path: `${attemptDirectory}/trace.zip`}).catch(() => {});
    await context.close().catch(() => {});
    await browser.close().catch(() => {});
  }
  return attempt;
}

async function directBrowserControl(pw, base, output, productUrl) {
  const browser = await pw.firefox.launch({headless: true, env: {...process.env, MOZ_DISABLE_CONTENT_SANDBOX: '1'}});
  const context = await browser.newContext({viewport: VIEWPORT, hasTouch: true, reducedMotion: 'reduce'});
  const blocked = [];
  await context.route('**/*', async route => {
    if (!SAFE_METHODS.has(route.request().method())) {
      blocked.push({method: route.request().method(), url: route.request().url()});
      await route.abort('blockedbyclient'); return;
    }
    await route.continue();
  });
  const page = await context.newPage();
  const started = Date.now();
  const control = {startedAt: now(), url: productUrl, method: 'location.assign from a fresh collection document', passed: false, liveWrites: 0};
  try {
    const collectionResponse = await page.goto(base + '/collections/all', {waitUntil: 'domcontentloaded', timeout: 45_000});
    assert(collectionResponse?.ok(), 'Native navigation control collection is healthy');
    let destinationResponse = null;
    page.on('response', response => {
      if (response.request().isNavigationRequest() && new URL(response.url()).pathname === new URL(productUrl).pathname) {
        destinationResponse = response;
      }
    });
    const navigation = waitForDestination(page, new URL(productUrl).pathname);
    await page.evaluate(url => location.assign(url), productUrl).catch(() => {});
    const navigationResult = await navigation;
    assert(navigationResult.navigated, 'Native location.assign reaches the product');
    await page.locator('main h1').first().waitFor({state: 'visible'});
    control.collectionStatus = collectionResponse.status();
    control.status = destinationResponse?.status() ?? null;
    control.finalUrl = page.url();
    control.elapsedMs = Date.now() - started;
    control.observed = navigationResult.observed;
    control.passed = destinationResponse?.ok() === true && new URL(page.url()).pathname === new URL(productUrl).pathname;
    control.title = await page.title();
    control.h1 = await page.locator('main h1').first().innerText();
    await page.screenshot({path: `${output}/direct-product-control.png`});
  } catch (error) {
    control.error = errorValue(error);
    control.finalUrl = page.url();
    control.elapsedMs = Date.now() - started;
  } finally {
    control.blockedMutationAttempts = blocked;
    await context.close().catch(() => {});
    await browser.close().catch(() => {});
  }
  return control;
}

export async function diagnoseFirefoxNavigation(base, output) {
  const target = new URL(base);
  assert.equal(target.protocol, 'https:', 'Diagnostic only targets HTTPS');
  assert.equal(target.hostname, 'hidiindia.com', 'Diagnostic is pinned to the HIDI production storefront');
  assert.equal(target.pathname, '/', 'Use the HIDI origin without a path');
  const modulePath = process.env.HIDI_PLAYWRIGHT_MODULE;
  assert(modulePath, 'HIDI_PLAYWRIGHT_MODULE must point to the isolated Playwright module');
  const pw = await import(pathToFileURL(modulePath).href);
  await mkdir(output, {recursive: true});
  const specifications = [
    {name: 'original-history-title-click-1', precondition: 'original-history', activation: 'pointer', settle: false},
    {name: 'original-history-title-click-2', precondition: 'original-history', activation: 'pointer', settle: false},
    {name: 'cold-title-click', precondition: 'cold', activation: 'pointer', settle: false},
    {name: 'cold-settled-title-click', precondition: 'cold', activation: 'pointer', settle: true},
    {name: 'cold-settled-title-enter', precondition: 'cold', activation: 'keyboard', settle: true},
    {name: 'cold-settled-dom-click', precondition: 'cold', activation: 'dom-click', settle: true},
  ];
  const attempts = [];
  for (const specification of specifications) {
    const attempt = await runAttempt(pw, target.origin, output, specification);
    attempts.push(attempt);
    await writeFile(`${output}/partial-report.json`, JSON.stringify({readOnly: true, liveWrites: 0, attempts}, null, 2) + '\n');
    console.log('FIREFOX_NAV_ATTEMPT', JSON.stringify({
      name: attempt.name, navigated: attempt.navigated, finalUrl: attempt.finalUrl,
      activationResult: attempt.activationResult, infrastructureError: attempt.infrastructureError,
    }));
  }
  const productUrl = attempts.find(item => item.destination)?.destination;
  assert(productUrl, 'At least one attempt discovered the first product destination');
  const directControl = await directBrowserControl(pw, target.origin, output, productUrl);
  const blockedMutationAttempts = attempts.flatMap(item => item.events?.blockedMutationAttempts || [])
    .concat(directControl.blockedMutationAttempts || []);
  const report = {
    diagnostic: 'HIDI Firefox 390x844 collection-to-product navigation',
    checkedAt: now(), sourceRun: 39563497609, base: target.origin, readOnly: true, liveWrites: 0,
    unsafeRequestsAllowed: 0, blockedMutationAttempts, directControl, attempts,
    classification: classifyFirefoxNavigation(attempts, directControl),
  };
  await writeFile(`${output}/report.json`, JSON.stringify(report, null, 2) + '\n');
  console.log('FIREFOX_NAV_DIAGNOSTIC', JSON.stringify({
    classification: report.classification, directControl: directControl.passed,
    attempts: attempts.map(item => ({name: item.name, navigated: item.navigated, finalUrl: item.finalUrl})),
    liveWrites: 0, blockedMutationAttempts: blockedMutationAttempts.length,
  }));
  return report;
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  await diagnoseFirefoxNavigation(process.argv[2] || 'https://hidiindia.com', process.argv[3] || 'evidence/seo-discovery/firefox-navigation-diagnostic');
}
