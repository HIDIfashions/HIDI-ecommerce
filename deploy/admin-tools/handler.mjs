import { readFile } from 'node:fs/promises';
import { createProductDeletionHandler } from './product-delete-handler.mjs';
const assets=new Map(['admin-tools.css','navigation.js','product-sheet.mjs','product-batch.mjs','workbook-reader.mjs','product-bulk.mjs','product-quick-fill.mjs','packing-scanner.mjs','product-delete.mjs','product-delete-links.js','product-photos.mjs','product-photo-match.mjs'].map(name=>['/admin-tools-assets/'+name,name]));
const pages=new Map([['/admin/product-quick-fill','product-quick-fill.html'],['/admin/product-bulk','product-bulk.html'],['/admin/packing-scanner','packing-scanner.html'],['/packing-scanner-control.html','packing-scanner.html'],['/admin/product-delete','product-delete.html'],['/admin/product-photos','product-photos.html']]);
export const navigationScript='<script defer data-hidi-admin-quick-tools src="/admin-tools-assets/navigation.js"></script><script defer data-hidi-product-delete-links src="/admin-tools-assets/product-delete-links.js"></script>';
export function injectQuickTools(html){if(!html.includes('data-hidi-admin-quick-tools'))return html+navigationScript;return html.includes('data-hidi-product-delete-links')?html:html+'<script defer data-hidi-product-delete-links src="/admin-tools-assets/product-delete-links.js"></script>';}
let deletionHandler;
export async function handleQuickTools(request,response,pathname,options={}){
  if(pathname.startsWith('/api/hidi/product-deletion/')){deletionHandler??=createProductDeletionHandler(options);return deletionHandler(request,response,pathname);}
  const file=assets.get(pathname)||pages.get(pathname);if(!file)return false;
  if(!['GET','HEAD'].includes(request.method)){response.writeHead(405,{'Allow':'GET, HEAD','Cache-Control':'no-store'});response.end();return true;}
  const body=await readFile(new URL(file,import.meta.url));const page=pages.has(pathname);
  response.writeHead(200,{'Content-Type':page?'text/html; charset=utf-8':file.endsWith('.css')?'text/css; charset=utf-8':'text/javascript; charset=utf-8','Cache-Control':'no-store','X-Robots-Tag':'noindex, nofollow, noarchive','X-Content-Type-Options':'nosniff','Referrer-Policy':'same-origin','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' https: http:; connect-src 'self'; frame-ancestors 'self'; base-uri 'self'; form-action 'self'",'Content-Length':body.length});response.end(request.method==='HEAD'?undefined:body);return true;
}
