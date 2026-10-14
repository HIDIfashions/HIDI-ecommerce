/** Photo-only HTTP adapter. All other methods/routes stay with the retained server. */
import {POST} from '../../apps/web/app/api/admin/inventory/[variantId]/images/route';
import {NextRequest} from 'next/server';
import type {IncomingMessage, ServerResponse} from 'node:http';

export async function handlePhotoUpload(request: IncomingMessage, response: ServerResponse, pathname: string): Promise<boolean> {
  const match = /^\/api\/admin\/inventory\/([A-Za-z0-9_-]{1,128})\/images$/.exec(pathname);
  if (!match || request.method !== 'POST' || !/^multipart\/form-data\s*;/i.test(String(request.headers['content-type'] || ''))) return false;
  const host = String(request.headers['x-forwarded-host'] || request.headers.host || '').split(',')[0].trim();
  if (!/^[a-z0-9.-]+(?::\d{1,5})?$/i.test(host) || !request.url?.startsWith('/') || request.url.startsWith('//')) {
    response.writeHead(400, {'Cache-Control':'no-store','Connection':'close'}); response.end(); return true;
  }
  const local = /^(?:localhost|127\.0\.0\.1)(?::\d+)?$/.test(host);
  const protocol = local ? 'http' : 'https';
  const controller = new AbortController();
  const cancel = () => { if (!response.writableFinished) controller.abort(); };
  request.once('aborted', cancel); response.once('close', cancel);
  const iterator = request.iterator({destroyOnReturn:false});
  const body = new ReadableStream<Uint8Array>({
    async pull(stream) {
      try { const part = await iterator.next(); if (part.done) stream.close(); else stream.enqueue(part.value); }
      catch (error) { stream.error(error); }
    },
    async cancel() { await iterator.return?.(); },
  }, {highWaterMark:0});
  try {
    const headers = new Headers();
    for (const [key,value] of Object.entries(request.headers)) if (value !== undefined) headers.set(key,Array.isArray(value)?value.join(','):value);
    const url = new URL(request.url, protocol+'://'+host);
    const incoming = new NextRequest(url, {method:'POST',headers,body,signal:controller.signal,duplex:'half'} as RequestInit & {duplex:'half'});
    const result = await POST(incoming,{params:Promise.resolve({variantId:match[1]})});
    const outgoing = Object.fromEntries(result.headers);
    Object.assign(outgoing, {'cache-control':'no-store, max-age=0','x-content-type-options':'nosniff','x-frame-options':'DENY','content-security-policy':"frame-ancestors 'none'; base-uri 'self'; object-src 'none'",'referrer-policy':'strict-origin-when-cross-origin','x-hidi-photo-upload':'stream-v1'});
    if (!request.complete) outgoing.connection = 'close';
    response.writeHead(result.status,outgoing);
    response.end(Buffer.from(await result.arrayBuffer()));
    if (!request.complete) request.resume();
  } catch {
    if (!response.headersSent) response.writeHead(502, {'Content-Type':'application/json','Cache-Control':'no-store','Connection':'close'});
    response.end(JSON.stringify({message:'Photo upload could not be completed. Check the product photos before retrying.'}));
    request.resume();
  } finally {
    request.removeListener('aborted',cancel); response.removeListener('close',cancel);
  }
  return true;
}
