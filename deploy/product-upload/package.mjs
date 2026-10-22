// Packages are opened locally. No request or catalogue write occurs here.
import {MAX_FILES,MAX_PHOTO_BYTES,canonical} from './model.mjs';
export const MAX_PACKAGE_BYTES=512*1024*1024;
const decoder=new TextDecoder('utf-8',{fatal:true}),types={jpg:'image/jpeg',jpeg:'image/jpeg',png:'image/png',webp:'image/webp',avif:'image/avif'};
const requireValue=(ok,message)=>{if(!ok)throw new Error(message);};
const crcTable=Uint32Array.from({length:256},(_,i)=>{for(let k=0;k<8;k++)i=(i>>>1)^((i&1)?0xedb88320:0);return i>>>0;});
function checksum(bytes){let crc=0xffffffff;for(const byte of bytes)crc=(crc>>>8)^crcTable[(crc^byte)&255];return (crc^0xffffffff)>>>0;}
const viewOf=bytes=>new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
async function bytesAt(file,start,length){requireValue(start>=0&&length>=0&&start+length<=file.size,'Package data is incomplete.');return new Uint8Array(await file.slice(start,start+length).arrayBuffer());}
function safePath(name){requireValue(name.length<=512&&!/[\\\u0000-\u001f\u007f]/.test(name)&&!name.startsWith('/')&&!/^[A-Za-z]:/.test(name),'Package contains an invalid folder path.');const parts=name.replace(/\/$/,'').split('/');requireValue(parts.every(p=>p&&p!=='.'&&p!=='..'),'Package contains an invalid folder path.');return name.normalize('NFC');}
export async function readProductPackage(file,onProgress=()=>{}){
  requireValue(file&&/\.zip$/i.test(file.name)&&file.size>=22,'Choose one ZIP containing your product spreadsheet and photos.');
  requireValue(file.size<=MAX_PACKAGE_BYTES,'ZIP is limited to 512 MB. Split a larger catalogue into smaller packages.');
  const tail=await bytesAt(file,Math.max(0,file.size-65557),Math.min(file.size,65557)),tv=viewOf(tail);let end=-1;
  for(let i=tail.length-22;i>=0;i--)if(tv.getUint32(i,true)===0x06054b50&&i+22+tv.getUint16(i+20,true)===tail.length){end=i;break;}
  requireValue(end>=0,'The ZIP is damaged or incomplete.');
  requireValue(!tv.getUint16(end+4,true)&&!tv.getUint16(end+6,true)&&tv.getUint16(end+8,true)===tv.getUint16(end+10,true),'Split ZIP packages are not supported.');
  const count=tv.getUint16(end+10,true),length=tv.getUint32(end+12,true),start=tv.getUint32(end+16,true),endOffset=file.size-tail.length+end;
  requireValue(count>0&&count<=2200&&length<=2*1024*1024&&start+length===endOffset,'Package has too many entries or an invalid ZIP directory.');
  const directory=await bytesAt(file,start,length),dv=viewOf(directory),entries=[],seen=new Set();let at=0,total=0;
  for(let i=0;i<count;i++){
    requireValue(at+46<=length&&dv.getUint32(at,true)===0x02014b50,'ZIP directory is damaged.');
    const flags=dv.getUint16(at+8,true),method=dv.getUint16(at+10,true),crc=dv.getUint32(at+16,true),compressed=dv.getUint32(at+20,true),size=dv.getUint32(at+24,true),nl=dv.getUint16(at+28,true),xl=dv.getUint16(at+30,true),cl=dv.getUint16(at+32,true),offset=dv.getUint32(at+42,true),disk=dv.getUint16(at+34,true),mode=dv.getUint32(at+38,true)>>>16;
    requireValue(at+46+nl+xl+cl<=length,'ZIP entry is incomplete.');
    const name=safePath(decoder.decode(directory.subarray(at+46,at+46+nl)));at+=46+nl+xl+cl;
    const key=canonical(name);requireValue(!seen.has(key),'Duplicate file or folder in ZIP: '+name);seen.add(key);
    requireValue(!(flags&1)&&!(flags&64)&&!disk&&[0,8].includes(method)&&(mode&0xf000)!==0xa000,'Encrypted ZIPs, links and this compression type are not supported.');
    requireValue(offset+30<=start&&compressed!==0xffffffff&&size!==0xffffffff&&(method!==0||compressed===size)&&compressed<=size+65536,'Invalid ZIP entry: '+name);
    if(name.endsWith('/')){requireValue(size===0,'Invalid package folder.');continue;}
    if(name.split('/').some(p=>p==='__MACOSX')||/^(?:\.DS_Store|Thumbs\.db|\._.*)$/i.test(name.split('/').at(-1)))continue;
    const extension=name.split('.').at(-1).toLowerCase(),type=types[extension],workbook=['xlsx','csv'].includes(extension);
    if(/(?:^|\/)(?:readme|instructions)(?:\.[a-z]+)?$/i.test(name)){requireValue(size<=64*1024,'Package instructions are too large.');continue;}
    requireValue(type||workbook,'Unsupported package file: '+name+'. Use JPEG, PNG, WebP or AVIF photos.');
    requireValue(size>0&&size<=(workbook?64*1024*1024:MAX_PHOTO_BYTES),'File is empty or too large: '+name+'. Photos have no separate byte cap; workbook and total ZIP safeguards still apply.');
    total+=size;requireValue(total<=MAX_PACKAGE_BYTES,'Expanded package exceeds 512 MB. Split it into smaller packages.');
    entries.push({path:name,name:name.split('/').at(-1),type:type||(extension==='csv'?'text/csv':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'),workbook,flags,method,crc,compressed,size,offset});
  }
  requireValue(at===length,'ZIP directory length differs from its entries.');
  requireValue(entries.filter(e=>e.workbook).length===1,'Include exactly one product Excel workbook or CSV in the ZIP.');
  requireValue(entries.filter(e=>!e.workbook).length<=MAX_FILES,'Include at most 1,000 product photos per package.');
  const ranges=[];
  // Validate every selected local header before allocating decompressed photos.
  for(const entry of entries){const local=await bytesAt(file,entry.offset,30),lv=viewOf(local);requireValue(lv.getUint32(0,true)===0x04034b50&&lv.getUint16(6,true)===entry.flags&&lv.getUint16(8,true)===entry.method,'ZIP headers differ: '+entry.path);const nl=lv.getUint16(26,true),xl=lv.getUint16(28,true);entry.dataStart=entry.offset+30+nl+xl;requireValue(entry.dataStart+entry.compressed<=start,'ZIP data is incomplete: '+entry.path);requireValue(decoder.decode(await bytesAt(file,entry.offset+30,nl))===entry.path,'ZIP filenames differ between headers.');ranges.push([entry.offset,entry.dataStart+entry.compressed]);}
  ranges.sort((a,b)=>a[0]-b[0]);for(let i=1;i<ranges.length;i++)requireValue(ranges[i][0]>=ranges[i-1][1],'ZIP file data overlaps.');
  let completed=0;
  for(const entry of entries){
    onProgress({completed,total:entries.length,path:entry.path});
    const blob=file.slice(entry.dataStart,entry.dataStart+entry.compressed);let data;
    if(entry.method===0)data=new Uint8Array(await blob.arrayBuffer());else{
      const reader=blob.stream().pipeThrough(new DecompressionStream('deflate-raw')).getReader(),chunks=[];let size=0;
      try{for(;;){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>entry.size){await reader.cancel();throw new Error('ZIP expands beyond its declared size: '+entry.path);}chunks.push(value);}}finally{reader.releaseLock();}
      data=new Uint8Array(size);let index=0;for(const chunk of chunks){data.set(chunk,index);index+=chunk.length;}
    }
    requireValue(data.length===entry.size&&checksum(data)===entry.crc,'Package file is damaged: '+entry.path);
    entry.file=new File([data],entry.name,{type:entry.type});completed++;
  }
  onProgress({completed,total:entries.length,path:''});
  return {workbook:entries.find(e=>e.workbook).file,photos:entries.filter(e=>!e.workbook),bytes:total};
}

// Folder names bind images to a colour, including duplicate camera filenames
// in different folders. Existing numbered-file packages retain legacy matching.
export function matchPackagePhotos(parsed,entries){
  const files=[],used=new Set(),aliases=new Set(),warnings=[];
  for(const group of parsed.groups){const colours=new Map();for(const row of group.variants){const key=canonical(row.color);if(!colours.has(key))colours.set(key,[]);colours.get(key).push(row);}
    for(const rows of colours.values()){
      const sku=rows.find(r=>r.imageSku)?.imageSku;if(!sku)continue;
      const folder=entries.filter(e=>e.path.split('/').at(-2)?.toUpperCase()===sku);
      if(!folder.length)continue;
      folder.sort((a,b)=>a.name.localeCompare(b.name,'en',{numeric:true})||a.path.localeCompare(b.path));
      requireValue(new Set(folder.map(e=>canonical(e.name))).size===folder.length,'Use only one folder for image_sku '+sku+'; it contains repeated filenames.');
      const requested=[...new Set(rows.flatMap(r=>r.photoNames))],main=rows.find(r=>r.mainPhoto)?.mainPhoto;
      const selected=requested.length?requested.map(name=>{const entry=folder.find(e=>e.name===name);requireValue(entry,'Photo '+name+' is missing from folder '+sku+'.');return entry;}):folder;
      const mapping=new Map();
      selected.forEach((entry,index)=>{
        requireValue(!used.has(entry),'Photo belongs to more than one product colour: '+entry.path);used.add(entry);
        const extension=entry.name.split('.').at(-1),name=sku+'_'+(index+1)+'.'+extension;
        requireValue(!aliases.has(canonical(name)),'Duplicate generated photo name: '+name);aliases.add(canonical(name));
        const file=new File([entry.file],name,{type:entry.file.type});file.packagePath=entry.path;files.push(file);mapping.set(entry.name,name);
      });
      requireValue(!main||mapping.has(main),'Main photo is missing from folder '+sku+'.');
      for(const row of rows){row.imageSku=sku;row.photoNames=selected.map(e=>mapping.get(e.name));row.mainPhoto=main?mapping.get(main):'';}
      warnings.push(sku+': '+selected.length+' photos matched from its folder. Original filenames are shown in the preview.');
    }
  }
  for(const entry of entries)if(!used.has(entry)){
    const candidates=parsed.groups.flatMap(group=>group.variants).filter(row=>row.imageSku&&(row.photoNames.includes(entry.name)||entry.name.toUpperCase().startsWith(row.imageSku+'_')&&/^\d{1,4}(?:_main)?\.(?:jpe?g|png|webp|avif)$/i.test(entry.name.slice(row.imageSku.length+1))));
    requireValue(candidates.length,'Photo has no matching product colour: '+entry.path+'. Put it in photos/<image_sku>/ or list its exact filename in photo_names.');
    requireValue(!aliases.has(canonical(entry.name)),'A loose photo conflicts with a product folder: '+entry.path);aliases.add(canonical(entry.name));entry.file.packagePath=entry.path;files.push(entry.file);
  }
  return {parsed,files,warnings};
}
