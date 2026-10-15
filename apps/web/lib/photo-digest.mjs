import {sha256} from '@noble/hashes/sha256';
/** Incremental SHA-256; do not require ReadableStream async-iterator support. */
export async function photoDigest(file){
  const hash=sha256.create();
  if(typeof file.stream==='function'){
    const reader=file.stream().getReader();
    try{
      for(;;){const {done,value}=await reader.read();if(done)break;hash.update(value);}
    }finally{reader.releaseLock();}
  }else{
    // Older browser fallback still reads bounded chunks, never the whole File.
    const chunkBytes=1024*1024;
    for(let offset=0;offset<file.size;offset+=chunkBytes){
      hash.update(new Uint8Array(await file.slice(offset,Math.min(offset+chunkBytes,file.size)).arrayBuffer()));
    }
  }
  return Array.from(hash.digest(),byte=>byte.toString(16).padStart(2,'0')).join('');
}
