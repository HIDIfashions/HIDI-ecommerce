import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {brotliCompressSync,gzipSync,brotliDecompressSync,gunzipSync,constants} from 'node:zlib';
import assert from 'node:assert/strict';
const hash=body=>createHash('sha256').update(body).digest('hex');
export async function prepareAsset(overlay,bundle){
 assert.match(bundle,/^assets\/index-[a-f0-9]{16}\.js$/);
 const original=await readFile(resolve(overlay,'dist',bundle)),sha256=hash(original),encodings={};
 const folder=resolve(overlay,'paint-performance');await mkdir(resolve(folder,'encodings'),{recursive:true});
 for(const encoding of ['br','gzip']){
  const bytes=encoding==='br'?brotliCompressSync(original,{params:{[constants.BROTLI_PARAM_QUALITY]:11,[constants.BROTLI_PARAM_MODE]:constants.BROTLI_MODE_TEXT}}):gzipSync(original,{level:9});
  assert.deepEqual((encoding==='br'?brotliDecompressSync:gunzipSync)(bytes),original);
  const file='encodings/'+sha256+'.'+encoding;await writeFile(resolve(folder,file),bytes);
  encodings[encoding]={file,sha256:hash(bytes),bytes:bytes.length};
 }
 const entry={url:'/'+bundle,sha256,bytes:original.length,encodings};
 await writeFile(resolve(folder,'asset-encodings.json'),JSON.stringify({entries:[entry]}));
 const referenceBr4Bytes=brotliCompressSync(original,{params:{[constants.BROTLI_PARAM_QUALITY]:4}}).length;
 assert(encodings.br.bytes<referenceBr4Bytes*.95,'Prepared Brotli must materially reduce the script transfer');
 return {passed:true,buildTimeCompression:true,decodedBytesIdentical:true,referenceBr4Bytes,...entry};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 const [overlay,bundle,report]=process.argv.slice(2);await writeFile(report,JSON.stringify(await prepareAsset(overlay,bundle),null,2));
}
