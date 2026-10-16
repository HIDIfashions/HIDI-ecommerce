import {readFileSync} from 'node:fs';
export function sendCriticalPoster(request,response,status,pathname,filePath,stat){
 const poster=stat.size<=256*1024&&/^\/media-performance\/assets\/poster-[a-f0-9]{16}\.avif$/.test(pathname),logo=stat.size<=16*1024&&/^\/media-performance\/assets\/logo-[a-f0-9]{16}\.png$/.test(pathname);
 if(status!==200||request.method!=='GET'||request.headers.range||!poster&&!logo)return false;
 const bytes=readFileSync(filePath);response.setHeader('Content-Length',bytes.length);response.writeHead(status);response.end(bytes);return true;
}
