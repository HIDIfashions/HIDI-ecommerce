import {parseDelimited} from './product-batch.mjs';
const decoder=new TextDecoder('utf-8',{fatal:true});
function xml(text){if(/<!DOCTYPE|<!ENTITY/i.test(text))throw new Error('Unsupported workbook XML.');const doc=new DOMParser().parseFromString(text,'application/xml');if(doc.querySelector('parsererror'))throw new Error('The workbook XML is damaged.');return doc;}
const elements=(node,tag)=>Array.from(node.getElementsByTagNameNS('*',tag));
const strings=node=>elements(node,'t').map(t=>t.textContent).join('');
async function unzipSelected(bytes){
  const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);let end=-1;
  for(let i=bytes.length-22;i>=Math.max(0,bytes.length-65557);i--)if(view.getUint32(i,true)===0x06054b50&&i+22+view.getUint16(i+20,true)===bytes.length){end=i;break;}
  if(end<0)throw new Error('Not a valid XLSX file.');if(view.getUint16(end+4,true)||view.getUint16(end+6,true))throw new Error('Split ZIP workbooks are unsupported.');
  const count=view.getUint16(end+10,true),central=view.getUint32(end+16,true);if(count===65535||central===0xffffffff||count>10000)throw new Error('Workbook has too many entries.');
  let at=central,total=0;const out=new Map();
  for(let i=0;i<count;i++){
    if(at+46>end||view.getUint32(at,true)!==0x02014b50)throw new Error('Workbook ZIP directory is damaged.');
    const flags=view.getUint16(at+8,true),method=view.getUint16(at+10,true),compressed=view.getUint32(at+20,true),size=view.getUint32(at+24,true),nl=view.getUint16(at+28,true),xl=view.getUint16(at+30,true),cl=view.getUint16(at+32,true),offset=view.getUint32(at+42,true);
    if(at+46+nl+xl+cl>end)throw new Error('Invalid workbook ZIP entry.');const name=decoder.decode(bytes.subarray(at+46,at+46+nl));at+=46+nl+xl+cl;
    if(!/^(?:xl\/workbook\.xml|xl\/_rels\/workbook\.xml\.rels|xl\/sharedStrings\.xml|xl\/worksheets\/[^/]+\.xml)$/.test(name))continue;
    if(out.has(name)||flags&1||![0,8].includes(method)||size>10*1024*1024||offset+30>central||view.getUint32(offset,true)!==0x04034b50)throw new Error('Unsupported or oversized workbook entry.');
    const start=offset+30+view.getUint16(offset+26,true)+view.getUint16(offset+28,true);if(start+compressed>central)throw new Error('Invalid workbook data length.');
    const source=bytes.subarray(start,start+compressed);let data=source;
    if(method===8){const reader=new Blob([source]).stream().pipeThrough(new DecompressionStream('deflate-raw')).getReader();const chunks=[];let length=0;try{for(;;){const {value,done}=await reader.read();if(done)break;length+=value.length;if(length>10*1024*1024||total+length>40*1024*1024){await reader.cancel();throw new Error('Workbook content is too large.');}chunks.push(value);}}finally{reader.releaseLock();}data=new Uint8Array(length);let p=0;for(const c of chunks){data.set(c,p);p+=c.length;}}
    total+=data.length;if(total>40*1024*1024||data.length!==size)throw new Error('Workbook content length is invalid or too large.');out.set(name,decoder.decode(data));
  }
  return out;
}
export async function readWorkbook(file){
  if(!file||!file.size)throw new Error('Choose a workbook or CSV file.');if(file.size>64*1024*1024)throw new Error('File is limited to 64 MB. Split the workbook.');
  if(/\.csv$/i.test(file.name))return [{name:file.name,rows:parseDelimited(await file.text())}];
  if(!/\.xlsx$/i.test(file.name))throw new Error('Use .xlsx or .csv. Save older .xls files as .xlsx first.');
  const files=await unzipSelected(new Uint8Array(await file.arrayBuffer()));if(!files.has('xl/workbook.xml')||!files.has('xl/_rels/workbook.xml.rels'))throw new Error('Workbook structure is missing.');
  const relations=new Map(elements(xml(files.get('xl/_rels/workbook.xml.rels')),'Relationship').filter(r=>r.getAttribute('TargetMode')!=='External').map(r=>[r.getAttribute('Id'),r.getAttribute('Target')]));
  const shared=files.has('xl/sharedStrings.xml')?elements(xml(files.get('xl/sharedStrings.xml')),'si').map(strings):[];
  const sheets=elements(xml(files.get('xl/workbook.xml')),'sheet');if(sheets.length>100)throw new Error('Import up to 100 worksheets per workbook.');const result=[];
  for(const sheet of sheets){if(sheet.getAttribute('state')==='hidden'||sheet.getAttribute('state')==='veryHidden')continue;
    const id=sheet.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships','id')||sheet.getAttribute('r:id');let target=relations.get(id);if(!target)throw new Error('Missing worksheet relationship.');
    target=target.startsWith('/')?target.slice(1):'xl/'+target;const parts=[];for(const part of target.split('/')){if(part==='..')parts.pop();else if(part!=='.')parts.push(part);}target=parts.join('/');if(!/^xl\/worksheets\/[^/]+\.xml$/.test(target)||!files.has(target))throw new Error('Unsupported worksheet path.');
    const rows=[];for(const row of elements(xml(files.get(target)),'row')){const cells=[];for(const c of elements(row,'c')){const address=c.getAttribute('r')||'';if(!/^[A-Z]+[1-9]\d*$/.test(address))throw new Error('Invalid worksheet cell address.');let column=0;for(const ch of address.match(/^[A-Z]+/)[0])column=column*26+ch.charCodeAt(0)-64;if(column>128)throw new Error('Use at most 128 columns per sheet.');
        const type=c.getAttribute('t'),v=elements(c,'v')[0]?.textContent??'';if(elements(c,'f').length&&!v)throw new Error('Formula results are missing. Recalculate and save the workbook first.');
        if(type==='s'&&(!/^\d+$/.test(v)||Number(v)>=shared.length))throw new Error('Invalid shared string.');cells[column-1]=type==='s'?shared[Number(v)]:type==='inlineStr'?strings(c):v;
      }if(cells.some(v=>v?.trim()))rows.push(Array.from({length:cells.length},(_,i)=>cells[i]||''));if(rows.length>20000)throw new Error('Sheet has too many rows.');}
    result.push({name:sheet.getAttribute('name')||'Worksheet',rows});
  }
  return result;
}
