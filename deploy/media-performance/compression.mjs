import {createBrotliCompress,createGzip,constants} from 'node:zlib';
import {pipeline} from 'node:stream';
import {prepareHeaders} from '../performance/delivery.mjs';

export function compressCatalogue(request,response,incoming,status,headers,pathname) {
  if(request.method!=='GET'||status!==200||!/^\/api\/store\/products(?:\/|$)/.test(pathname)||!String(headers['content-type']).includes('application/json')||headers['content-encoding']||request.headers.range)return false;
  const prepared=prepareHeaders(request,headers,status);
  if(!prepared.encoding)return false;
  response.writeHead(status,prepared.headers);
  const zip=prepared.encoding==='br'?createBrotliCompress({params:{[constants.BROTLI_PARAM_QUALITY]:4}}):createGzip({level:6});
  response.on('close',()=>{incoming.destroy();zip.destroy();});
  pipeline(incoming,zip,response,error=>{if(error)response.destroy();});
  return true;
}
