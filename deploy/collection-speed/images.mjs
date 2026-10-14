/** Bounded product-photo delivery. Original Blob objects are never modified. */
import { createHash } from 'node:crypto';
import { downloadPhotoToDisk } from './photo-disk.mjs';
import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile, rename, readdir, stat, unlink } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

export const IMAGE_VERSION = '3';
export const SOURCE_LIMIT = 40 * 1024 * 1024;
export const PIXEL_LIMIT = 100_000_000;
const WIDTHS = new Set([16,32,48,64,96,128,256,384,640,750,828,1080,1200,1920,2048,3840]);
const HOSTS = new Set(['thehidi.com','www.thehidi.com','hidiindia.com','www.hidiindia.com','thidigk.thehidi.com','azure-preview.thehidi.com']);
const TYPES = new Set(['image/jpeg','image/png','image/webp','image/avif']);
const MASTER_WIDTH = 1920;
const ZOOM_WIDTH = 3840;
const ROOT = dirname(fileURLToPath(import.meta.url));
const hash = value => createHash('sha256').update(value).digest('hex');

export function mediaPath(value) {
  if (typeof value !== 'string' || value.length > 2000 || value.includes('\\') || value.includes('../')) return null;
  if (!(value.startsWith('/') && !value.startsWith('//')) && !value.startsWith('https://')) return null;
  let url;
  try { url = new URL(value, 'https://hidiindia.com'); } catch { return null; }
  if (url.protocol !== 'https:' || url.username || url.password || !HOSTS.has(url.hostname) || url.port || url.hash) return null;
  if (!/^\/media\/products\/(?:[a-zA-Z0-9_-]+\/)*[a-zA-Z0-9_-]+\.(?:jpg|jpeg|png|webp|avif)$/.test(url.pathname)) return null;
  if ([...url.searchParams.keys()].some(key => key !== 'hidi_image') || url.searchParams.getAll('hidi_image').length > 1) return null;
  return url.pathname.replace(/^\/media\/products\/_display_v[23]\//, '/media/products/');
}

export function acceptsWebp(accept = '') {
  return String(accept).split(',').some(part => {
    const [type, ...parameters] = part.trim().toLowerCase().split(';');
    if (type.trim() !== 'image/webp') return false;
    let quality = 1;
    for (const parameter of parameters) {
      const pair = parameter.trim().split('=');
      if (pair[0] === 'q') quality = Number(pair[1]);
    }
    return Number.isFinite(quality) && quality > 0 && quality <= 1;
  });
}

export function imageRequest(url, accept = '') {
  if (url.pathname !== '/_next/image') return null;
  const source = mediaPath(url.searchParams.get('url'));
  if (!source) return null; // Preserve Next's existing handling of other approved assets.
  if ([...url.searchParams.keys()].some(key => !['url','w','q'].includes(key)) ||
      ['url','w','q'].some(key => url.searchParams.getAll(key).length !== 1)) return { error: 400 };
  const width = url.searchParams.get('w') || '';
  if (!/^\d+$/.test(width) || !WIDTHS.has(Number(width)) || url.searchParams.get('q') !== '75') return { error: 400 };
  return { source, width: Number(width), format: acceptsWebp(accept) ? 'webp' : 'jpeg', quality: 75 };
}

export function derivativeKey({ source, width, format, quality = 75 }) {
  return hash([IMAGE_VERSION,source,width,format,quality].join('|')) + '.' + format;
}
export function masterKey(source, width = MASTER_WIDTH) {
  return hash([IMAGE_VERSION,'master',source,width].join('|')) + '.webp';
}
async function existing(file) {
  try { return await readFile(file); } catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}
async function atomic(file, bytes) {
  await mkdir(dirname(file), { recursive: true });
  const temp = file + '.' + process.pid + '.' + Math.random().toString(16).slice(2);
  try { await writeFile(temp, bytes); await rename(temp, file); }
  finally { await unlink(temp).catch(() => {}); }
}

/** Enforce the byte limit even when the upstream omits/lies about Content-Length. */
export async function boundedBody(response) {
  const declared = response.headers.get('content-length');
  const type = (response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
  if (!response.ok || !response.body || (type && !TYPES.has(type)) ||
      (declared !== null && (!/^\d+$/.test(declared) || Number(declared) > SOURCE_LIMIT))) {
    await response.body?.cancel().catch(() => {});
    throw new Error('Product media unavailable or exceeds the 40 MiB limit');
  }
  const reader = response.body.getReader();
  const parts = []; let count = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      count += value.byteLength;
      if (count > SOURCE_LIMIT) throw new Error('Product media exceeds the 40 MiB limit');
      parts.push(value);
    }
  } finally { await reader.cancel().catch(() => {}); }
  if (!count) throw new Error('Empty product photo');
  return Buffer.concat(parts, count);
}

/** Resize without cropping, reorientation errors, upscaling, or original fallback. */
export async function resizedImage(sharp, input, width, format, quality) {
  if (Buffer.isBuffer(input)) {
    if (!input.length || input.length > SOURCE_LIMIT) throw new Error('Invalid in-memory photo size');
  } else if (typeof input === 'string') {
    const file = await stat(input); if (!file.isFile() || file.size < 1) throw new Error('Invalid product photo file');
  } else throw new Error('Invalid product photo input');
  if (!Number.isInteger(width) || width < 1 || width > ZOOM_WIDTH || !['webp','jpeg'].includes(format) ||
      !Number.isInteger(quality) || quality < 1 || quality > 100) throw new Error('Invalid image transform');
  const maxHeight = Math.min(width * 2, 5760);
  const metadata = await sharp(input, { limitInputPixels: PIXEL_LIMIT, failOn: 'warning' }).metadata();
  if (!['jpeg','png','webp','heif','avif'].includes(metadata.format) || (metadata.pages || 1) > 1) throw new Error('A single still product photo is required');
  async function render(failOn = 'warning') {
    let pipeline = sharp(input, { limitInputPixels: PIXEL_LIMIT, sequentialRead: true, failOn })
      .rotate().resize({ width, height: maxHeight, fit: 'inside', withoutEnlargement: true })
      .withIccProfile('srgb').timeout({ seconds: 30 });
    // Preserve transparency in the reusable WebP master. JPEG fallback uses white,
    // rather than turning transparent pixels black. No garment recolouring/retouching.
    pipeline = format === 'webp' ? pipeline.webp({ quality, effort: 2 }) : pipeline.flatten({ background: '#ffffff' }).jpeg({ quality });
    return pipeline.toBuffer();
  }
  let output;
  try { output = await render(); }
  catch (error) {
    const jpeg = metadata.format === "jpeg";
    if (!jpeg || !/VipsJpeg: (?:premature end of JPEG image|Corrupt JPEG data: premature end of data segment)/i.test(error.message)) throw error;
    output = await render('none'); // Retain the existing narrow JPEG recovery.
  }
  const result = await sharp(output).metadata();
  if (!result.width || !result.height || result.width > width || result.height > maxHeight ||
      result.format !== format || output.length > 10 * 1024 * 1024) throw new Error('Image resizing failed');
  return output;
}

export function createImageStore({ sharp, fetchSource, cacheDir = join(tmpdir(),'hidi-product-images-v3'), seedDir = join(ROOT,'seed'), maxPending = 12 }) {
  if (!Number.isInteger(maxPending) || maxPending < 1 || maxPending > 40) throw new Error('Invalid image queue size');
  const jobs = new Map(); let tail = Promise.resolve(); let pending = 0;
  async function save(key, bytes) {
    await atomic(join(cacheDir,key),bytes);
    const entries = (await Promise.all((await readdir(cacheDir))
      .filter(name => /^[a-f0-9]{64}\.(?:jpg|jpeg|webp)$/.test(name))
      .map(async name => { try { return {name,...await stat(join(cacheDir,name))}; } catch (error) { if (error.code === 'ENOENT') return null; throw error; } }))).filter(Boolean);
    let total = entries.reduce((n,file) => n + file.size,0);
    for (const file of entries.sort((a,b) => a.mtimeMs - b.mtimeMs)) {
      if (total <= 256 * 1024 * 1024) break;
      await unlink(join(cacheDir,file.name)).catch(() => {}); total -= file.size;
    }
  }
  function single(key, work) {
    if (jobs.has(key)) return jobs.get(key);
    if (pending >= maxPending) return Promise.reject(new Error('Image queue busy'));
    pending++;
    const task = tail.catch(() => {}).then(work);
    tail = task.catch(() => {}); jobs.set(key,task);
    task.finally(() => { jobs.delete(key); pending--; }).catch(() => {});
    return task;
  }
  async function master(source, width = MASTER_WIDTH) {
    if (mediaPath(source) !== source || ![MASTER_WIDTH,ZOOM_WIDTH].includes(width)) throw new Error('Invalid product image master');
    const key = masterKey(source,width);
    const cached = await existing(join(seedDir,key)) || await existing(join(cacheDir,key));
    if (cached) return cached;
    return single('master:' + key, async () => {
      const prior = await existing(join(cacheDir,key)); if (prior) return prior;
      // Fetch INSIDE the serial queue: concurrent visitors cannot accumulate many
      // 40 MB originals while they wait for a decoder, including zoom requests.
      const original = await fetchSource(source);
      try {
        const bytes = await resizedImage(sharp,original?.path || original,width,'webp',92);
        await save(key,bytes); return bytes;
      } finally { await original?.cleanup?.(); }
    });
  }
  async function get(spec) {
    if (mediaPath(spec.source) !== spec.source || !WIDTHS.has(spec.width) || !['webp','jpeg'].includes(spec.format) || spec.quality !== 75) throw new Error('Invalid product image request');
    const key = derivativeKey(spec);
    const cached = await existing(join(seedDir,key)) || await existing(join(cacheDir,key));
    if (cached) return { bytes:cached, cache:'HIT' };
    // Never nest queue waits. The large zoom master is made only when requested.
    const input = await master(spec.source,spec.width <= MASTER_WIDTH ? MASTER_WIDTH : ZOOM_WIDTH);
    const bytes = await single(key,async () => {
      const prior = await existing(join(cacheDir,key)); if (prior) return prior;
      const output = await resizedImage(sharp,input,spec.width,spec.format,spec.quality);
      await save(key,output); return output;
    });
    return { bytes, cache:'MISS' };
  }
  return { get, master };
}

export function createProductImageHandler({ origin, runtimeRoot = resolve(ROOT,'..'), sharp: providedSharp, fetchSource: providedFetch, cacheDir, seedDir }) {
  const require = createRequire(join(runtimeRoot,'apps/web/server.js'));
  const sharp = providedSharp || require('next/dist/server/image-optimizer.js').getSharp(1,false);
  const fetchSource = providedFetch || (async source => {
    const signal = AbortSignal.timeout(300000);
    return downloadPhotoToDisk(await fetch(new URL(source,origin), {signal,redirect:'error'}), {signal});
  });
  const store = createImageStore({ sharp,fetchSource,cacheDir,seedDir });
  async function handle(request,response,pathname) {
    if (pathname !== '/_next/image') return false;
    const spec = imageRequest(new URL(request.url,'https://hidiindia.com'),request.headers.accept || '');
    if (!spec) return false;
    if (!['GET','HEAD'].includes(request.method) || spec.error) {
      response.writeHead(spec.error || 405, { 'Cache-Control':'no-store', ...(!['GET','HEAD'].includes(request.method) ? {Allow:'GET, HEAD'} : {}) }); response.end(); return true;
    }
    const start = performance.now();
    try {
      const { bytes,cache } = await store.get(spec); const etag = '"' + hash(bytes) + '"';
      const headers = { 'Content-Type':'image/' + spec.format, 'Content-Length':bytes.length,
        'Cache-Control':'public, max-age=31536000, immutable', 'Vary':'Accept', 'ETag':etag,
        'X-Content-Type-Options':'nosniff', 'X-Hidi-Image-Cache':cache, 'X-Hidi-Image-Version':IMAGE_VERSION,
        'Server-Timing':'product-image;dur=' + (performance.now()-start).toFixed(1) };
      const matches = String(request.headers['if-none-match'] || '').split(',').some(tag => tag.trim().replace(/^W\//,'') === etag || tag.trim() === '*');
      if (matches) { delete headers['Content-Length']; response.writeHead(304,headers); response.end(); }
      else { response.writeHead(200,headers); response.end(request.method === 'HEAD' ? undefined : bytes); }
    } catch { response.writeHead(503, { 'Cache-Control':'no-store','Retry-After':'5' }); response.end(); }
    return true;
  }
  const prepared = new Set(); let timer; let stopped = false;
  async function warm() {
    try {
      const response = await fetch(new URL('/api/store/products',origin), { signal:AbortSignal.timeout(15000),redirect:'error' });
      if (!response.ok) return;
      const products = await response.json(); if (!Array.isArray(products)) return;
      const paths = new Set();
      for (const product of products.slice(0,200)) for (const image of [...(product.images || []),...(product.variants || []).flatMap(v => v.images || [])]) {
        const path = mediaPath(image.url); if (path) paths.add(path);
      }
      for (const source of [...paths].slice(0,400)) {
        if (stopped) break;
        if (prepared.has(source)) continue;
        try { for (const width of [384,640,750,828,1080,1200]) await store.get({ source,width,format:'webp',quality:75 }); prepared.add(source); } catch {}
      }
    } catch {}
    finally { if (!stopped) { timer = setTimeout(warm,30000); timer.unref(); } }
  }
  function startWarm() { if (!timer) { stopped = false; timer = setTimeout(warm,2500); timer.unref(); } }
  function stopWarm() { stopped = true; clearTimeout(timer); timer = undefined; }
  return { handle,store,startWarm,stopWarm };
}
