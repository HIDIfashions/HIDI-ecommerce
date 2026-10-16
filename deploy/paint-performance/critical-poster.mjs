import {readFileSync} from 'node:fs';
export function sendCriticalPoster(request,response,status,pathname,filePath,stat){
 if(status!==200||request.method!=='GET'||request.headers.range||stat.size>256*1024||!/^\/media-performance\/assets\/poster-[a-f0-9]{16}\.avif$/.test(pathname))return false;
 const bytes=readFileSync(filePath);response.setHeader('Content-Length',bytes.length);response.writeHead(status);response.end(bytes);return true;
}
