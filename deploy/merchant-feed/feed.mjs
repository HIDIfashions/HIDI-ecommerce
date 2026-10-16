import { createHash } from 'node:crypto';

export const origin = 'https://hidiindia.com';
export const feedPath = '/google-products.xml';
const clean = value => String(value ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g, '').trim();
const xml = value => clean(value).replace(/[<>&"']/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&apos;'}[c]));
const field = (key, value) => `<g:${key}>${xml(value)}</g:${key}>`;
const validId = value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,50}$/.test(value);
export function imageUrl(value) {
  const url = new URL(value);
  if (!['https://hidiindia.com', 'https://thidigk.thehidi.com'].includes(url.origin) ||
      !url.pathname.startsWith('/media/products/') || url.search || url.hash || url.username || url.password) throw new Error('Unpublished image');
  return origin + url.pathname;
}
export function buildFeed(products) {
  if (!Array.isArray(products) || !products.length) throw new Error('Empty catalogue');
  const ids = new Set(), items = [], audit = {products:0, offers:0, omittedUnavailable:0, identifiers:'Brand supplied; no invented GTIN or MPN'};
  for (const p of products) {
    if (p.status && p.status !== 'ACTIVE') continue;
    if (!validId(p.id) || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(p.slug) || !clean(p.name)) throw new Error('Invalid product');
    const description = clean(p.description || p.shortDescription);
    if (!description || /<\/?[a-z][^>]*>/i.test(description)) throw new Error('Missing/plain-text description required: '+p.slug);
    if (!Array.isArray(p.variants) || !p.variants.length) throw new Error('Missing variants');
    let published = false;
    const combinations = new Set();
    for (const v of p.variants) {
      if (!Number.isSafeInteger(v.available) || v.available < 0) throw new Error('Invalid availability');
      // Sold-out variants are removed rather than landing on a different available size.
      if (!p.inStock || v.available === 0) { audit.omittedUnavailable++; continue; }
      if (!validId(v.id) || ids.has(v.id) || !clean(v.size) || !clean(v.color) || !Number.isSafeInteger(v.pricePaise) || v.pricePaise <= 0) throw new Error('Invalid offer: '+p.slug);
      const size = clean(v.size).toUpperCase().replace(/^XXXL$/, '3XL');
      const combination = clean(v.color).toLowerCase()+'|'+size;
      if (combinations.has(combination)) throw new Error('Duplicate size/color: '+p.slug);
      combinations.add(combination); ids.add(v.id);
      const records = [...(v.images || []), ...p.variants.filter(other => other.color === v.color).flatMap(other => other.images || []), ...(p.images || [])];
      const images = [...new Set(records.map(i => imageUrl(i.url)))];
      if (!images.length) throw new Error('Missing image: '+p.slug);
      const suffix = ' — '+clean(v.color)+' — '+size;
      const title = clean(p.name).slice(0, 150-suffix.length).trimEnd()+suffix;
      const link = origin+'/products/'+p.slug+'?variant='+encodeURIComponent(v.id);
      const attributes = {id:v.id, item_group_id:p.id, title, description:description.slice(0,5000), link,
        canonical_link:origin+'/products/'+p.slug, image_link:images[0], availability:'in_stock',
        price:(v.pricePaise/100).toFixed(2)+' INR', condition:'new', brand:'HIDI', gender:'female', age_group:'adult',
        color:clean(v.color), size, product_type:"Apparel & Accessories > Clothing > Women's Indian Wear"};
      if (clean(p.fabric)) attributes.material = clean(p.fabric);
      items.push('<item>'+Object.entries(attributes).map(([k,value])=>field(k,value)).join('')+
        images.slice(1,11).map(value=>field('additional_image_link',value)).join('')+'</item>');
      published = true;
    }
    if (published) audit.products++;
  }
  if (!items.length) throw new Error('No purchasable offers');
  audit.offers = items.length;
  return {xml:'<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0"><channel><title>HIDI India products</title><link>'+origin+'</link><description>HIDI published apparel catalogue</description>'+items.join('\n')+'</channel></rss>\n', audit};
}

export async function loadProducts(catalogueUrl, fetcher = fetch) {
  async function get(url) {
    const r = await fetcher(url, {method:'GET',redirect:'error',signal:AbortSignal.timeout(12000),headers:{Accept:'application/json'}});
    if (!r.ok) throw new Error('Catalogue unavailable');
    const body = await r.text();
    if (Buffer.byteLength(body)>8*1024*1024) throw new Error('Catalogue too large');
    return JSON.parse(body);
  }
  const list = await get(catalogueUrl);
  if (!Array.isArray(list) || !list.length || list.length>2000) throw new Error('Invalid catalogue');
  const active = list.filter(p => !p.status || p.status === 'ACTIVE'), result = new Array(active.length);
  let cursor = 0;
  await Promise.all(Array.from({length:Math.min(6,active.length)}, async()=>{
    while (cursor<active.length) {
      const index=cursor++, p=active[index];
      if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(p.slug)) throw new Error('Invalid slug');
      const detail = await get(catalogueUrl.replace(/\/$/,'')+'/'+p.slug);
      if (detail.id!==p.id || detail.slug!==p.slug) throw new Error('Catalogue identity changed');
      result[index]=detail;
    }
  }));
  return result;
}

export function createMerchantFeed({catalogueUrl,isProductionRequest,fetcher=fetch,now=Date.now,ttl=60000}) {
  const endpoint=new URL(catalogueUrl);
  if (!['https:','http:'].includes(endpoint.protocol) || endpoint.username || endpoint.password) throw new Error('Invalid API URL');
  let cache, expires=0, pending;
  return async(request,response)=>{
    const send=(status,headers,body)=>{response.writeHead(status,headers);response.end(request.method==='HEAD'?undefined:body);};
    if (!isProductionRequest(request)) return send(404,{'Cache-Control':'no-store'},'Not found');
    if (!['GET','HEAD'].includes(request.method)) return send(405,{Allow:'GET, HEAD','Cache-Control':'no-store'},'Method not allowed');
    try {
      if (!cache || now()>=expires) {
        if (!pending) pending=loadProducts(endpoint.href,fetcher).then(buildFeed).then(value=>{
          cache=value.xml;expires=now()+ttl;return cache;
        }).finally(()=>{pending=undefined;});
        await pending;
      }
      return send(200,{'Content-Type':'application/xml; charset=utf-8','Cache-Control':'public, max-age=60','Content-Length':Buffer.byteLength(cache),'ETag':'"'+createHash('sha256').update(cache).digest('hex')+'"'},cache);
    } catch {
      return send(503,{'Content-Type':'text/plain; charset=utf-8','Cache-Control':'no-store','Retry-After':'60'},'Product feed temporarily unavailable');
    }
  };
}
