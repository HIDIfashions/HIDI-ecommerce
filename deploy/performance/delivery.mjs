import { createBrotliCompress, createGzip, constants } from 'node:zlib';
import { Transform } from 'node:stream';
import { StringDecoder } from 'node:string_decoder';

// Never recompress upstream bodies or range responses. Honor explicit q=0.
export function encodingFor(request) {
  const values = new Map(String(request.headers['accept-encoding'] || '').split(',').map(part => {
    const [name, ...params] = part.trim().toLowerCase().split(';');
    const q = params.find(value => value.trim().startsWith('q='));
    return [name, q ? Math.max(0, Math.min(1, Number(q.trim().slice(2)) || 0)) : 1];
  }));
  const quality = name => values.get(name) ?? values.get('*') ?? 0;
  const br = quality('br'), gzip = quality('gzip');
  return br > 0 && br >= gzip ? 'br' : gzip > 0 ? 'gzip' : '';
}

function compressor(encoding) {
  return encoding === 'br'
    ? createBrotliCompress({ flush: constants.BROTLI_OPERATION_FLUSH, params: { [constants.BROTLI_PARAM_QUALITY]: 4 } })
    : createGzip({ level: 6, flush: constants.Z_SYNC_FLUSH });
}

export function prepareHeaders(request, headers, status = 200) {
  const output = { ...headers };
  const vary = new Set(String(output.vary || '').split(',').map(x => x.trim()).filter(Boolean));
  if (!Array.from(vary).some(x => x.toLowerCase() === 'accept-encoding')) vary.add('Accept-Encoding');
  output.vary = [...vary].join(', ');
  const encoding = !output['content-encoding'] && !output['content-range'] && !request.headers.range
    && request.method === 'GET' && status === 200 && !/\bno-transform\b/i.test(output['cache-control'] || '')
    ? encodingFor(request) : '';
  if (encoding) {
    output['content-encoding'] = encoding;
    delete output['content-length'];
    if (output.etag && !String(output.etag).startsWith('W/')) output.etag = 'W/' + output.etag;
  }
  return { headers: output, encoding };
}

export function sendBuffer(request, response, status, headers, body) {
  const prepared = prepareHeaders(request, headers, status);
  response.writeHead(status, prepared.headers);
  if (request.method === 'HEAD' || [204, 304].includes(status)) return response.end();
  if (!prepared.encoding) return response.end(body);
  const zip = compressor(prepared.encoding);
  zip.on('error', () => response.destroy());
  response.on('close', () => zip.destroy());
  zip.pipe(response); zip.end(body);
}

// Hold only the head (up to 64 KiB), then a small tail for body-end hooks.
// Backpressure flows through pipe; UTF-8 split across chunks is preserved.
export function htmlTransform(head, tail, onComplete, maxCache = 2 * 1024 * 1024) {
  const decoder = new StringDecoder('utf8');
  let pending = '', opened = false, size = 0, captured = [];
  const emit = (stream, text) => {
    if (!text) return;
    const bytes = Buffer.from(text); size += bytes.length;
    if (captured && size <= maxCache) captured.push(bytes); else captured = null;
    stream.push(bytes);
  };
  const consume = (stream, text, final = false) => {
    pending += text;
    if (!opened) {
      const match = /<\/head\s*>/i.exec(pending);
      if (match) {
        const end = match.index + match[0].length;
        emit(stream, head(pending.slice(0, end))); pending = pending.slice(end); opened = true;
      } else if (Buffer.byteLength(pending) >= 65536 || final) {
        // A missing or overlarge head retains all original bytes; hooks remain.
        emit(stream, head('')); opened = true;
      } else return;
    }
    if (final) { emit(stream, tail(pending)); pending = ''; }
    else if (pending.length > 512) { emit(stream, pending.slice(0, -512)); pending = pending.slice(-512); }
  };
  return new Transform({
    transform(chunk, _encoding, done) { try { consume(this, decoder.write(chunk)); done(); } catch (error) { done(error); } },
    flush(done) {
      try { consume(this, decoder.end(), true); onComplete?.(captured ? Buffer.concat(captured) : null); done(); }
      catch (error) { done(error); }
    },
  });
}

export function streamHtml(request, response, incoming, status, headers, options) {
  const clean = { ...headers }; delete clean['content-length']; delete clean.etag;
  const prepared = prepareHeaders(request, clean, status);
  response.writeHead(status, prepared.headers);
  const transform = htmlTransform(options.head, options.tail, options.onComplete);
  const zip = prepared.encoding ? compressor(prepared.encoding) : null;
  const stop = () => { incoming.destroy(); transform.destroy(); zip?.destroy(); };
  incoming.on('error', () => response.destroy()); transform.on('error', () => response.destroy());
  zip?.on('error', () => response.destroy()); response.on('close', stop);
  if (zip) incoming.pipe(transform).pipe(zip).pipe(response);
  else incoming.pipe(transform).pipe(response);
}
