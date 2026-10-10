import {parseSheet, detailsPayload, pricePaise} from './product-sheet.mjs';
export const TEMPLATE_HEADERS=['action','product_id','hidi_sku','product_slug','product_name','style_code','category','short_description','description','fabric','care','color','sizes','selling_price','mrp'];
export const blankTemplate=TEMPLATE_HEADERS.join(',')+'\r\n';
const normalize=v=>String(v??'').normalize('NFKC').trim();
export const canonical=v=>normalize(v).replace(/\s+/g,' ').toLowerCase();
const header=v=>canonical(v).replace(/[^a-z0-9]/g,'');
const aliases={action:'action',productid:'id',hidisku:'sku',productslug:'slug',producturl:'slug',productname:'name',name:'name',stylecode:'style',category:'category',shortdescription:'shortDescription',description:'description',fabric:'fabric',care:'care',washcare:'care',color:'color',colour:'color',sizes:'sizes',size:'sizes',sellingprice:'price',price:'price',mrp:'mrp'};
const sizes=v=>[...new Set(normalize(v).toUpperCase().split(/[,;|/]+|\s+(?=(?:XXXL|XXL|XL|L|M|S|XS|3XXL)\b)/).map(s=>s.trim()).filter(Boolean))];
export function parseDelimited(text,delimiter=','){
  if(text.length>8*1024*1024)throw new Error('CSV is limited to 8 MB. Split the batch.');
  text=text.replace(/^\uFEFF/,'');const rows=[];let row=[],value='',quoted=false,closed=false;
  const push=()=>{row.push(value);value='';closed=false;};const finish=()=>{push();if(row.some(c=>c.trim()))rows.push(row);row=[];if(rows.length>20000)throw new Error('The file has too many rows.');};
  for(let i=0;i<text.length;i++){const c=text[i];if(quoted){if(c==='"'){if(text[i+1]==='"'){value+='"';i++;}else{quoted=false;closed=true;}}else value+=c;continue;}
    if(c===delimiter){push();continue;}if(c==='\n'||c==='\r'){if(c==='\r'&&text[i+1]==='\n')i++;finish();continue;}
    if(c==='"'&&!value&&!closed){quoted=true;continue;}if(closed&&!/\s/.test(c))throw new Error('Invalid quoted CSV cell.');if(!closed)value+=c;
  }
  if(quoted)throw new Error('CSV contains an unclosed quoted cell.');if(value||row.length||closed)finish();return rows;
}
function entry(source,parsed,extra={},mode){
  const action=normalize(extra.action).toUpperCase()||mode;
  return {source,mode:action,id:normalize(extra.id),sku:normalize(extra.sku),slug:normalize(extra.slug),fields:{...parsed.fields},category:parsed.category||'',color:extra.color||parsed.color||'',sizes:sizes(extra.sizes||parsed.sizes.join(',')),price:normalize(extra.price),mrp:normalize(extra.mrp),warnings:[...parsed.warnings],selected:new Set(Object.keys(parsed.fields).filter(k=>parsed.fields[k])),included:true,record:null,target:'',status:'pending',error:!['UPDATE','NEW'].includes(action)?'Action must be UPDATE or NEW.':''};
}
export function parseWorkbook(sheets,mode='UPDATE'){
  const entries=[],ignored=[];
  for(const sheet of sheets){const rows=sheet.rows;let found=false;
    const hi=rows.findIndex(row=>{const keys=row.map(v=>aliases[header(v)]).filter(Boolean);return keys.length>=2&&keys.some(k=>['name','id','sku','slug'].includes(k));});
    if(hi>=0){const keys=rows[hi].map(v=>aliases[header(v)]||'');const nonempty=keys.filter(Boolean);if(new Set(nonempty).size!==nonempty.length)throw new Error(sheet.name+': duplicate recognised column headings.');
      for(let i=hi+1;i<rows.length;i++){if(!rows[i].some(v=>normalize(v)))continue;const data={};keys.forEach((k,c)=>{if(k)data[k]=normalize(rows[i][c]);});const fields={};for(const k of ['name','shortDescription','description','fabric','care'])if(data[k])fields[k]=data[k];
        if(data.style)fields.description=[fields.description,'Supplier style code: '+data.style].filter(Boolean).join('\n');
        const item=entry(sheet.name+' · row '+(i+1),{fields,category:data.category,color:data.color,sizes:[],warnings:[]},data,mode);if(!data.name&&!data.id&&!data.sku&&!data.slug)item.error='A product name or HIDI product identity is required.';entries.push(item);found=true;
      }
    }else{const starts=[];rows.forEach((r,i)=>{if(header(r.find(v=>normalize(v))||'')==='productname'||/^product name\s*:/i.test(r.join(' ')))starts.push(i);});
      for(let n=0;n<starts.length;n++){const block=rows.slice(n===0?0:starts[n],starts[n+1]??rows.length);const text=block.map(r=>r.join('\t')).join('\n');const parsed=parseSheet(text);const extra={};for(const r of block){const m=r.join('\t').match(/^(selling price|price|mrp)\s*[:\t]\s*(.+)$/i);if(m)extra[/mrp/i.test(m[1])?'mrp':'price']=m[2].trim();}
        entries.push(entry(sheet.name+' · product '+(n+1),parsed,extra,mode));found=true;
      }
    }
    if(!found)ignored.push(sheet.name);if(entries.length>500)throw new Error('Import up to 500 products per batch. Split this workbook.');
  }
  if(!entries.length)throw new Error('No product rows found. Use the blank row template or sheets with a Product Name label.');return {entries,ignored};
}
export function exactMatch(item,catalog){
  if(item.mode==='NEW')return null;
  let matches=[];
  if(item.id)matches=catalog.filter(p=>p.id===item.id);
  else if(item.slug)matches=catalog.filter(p=>p.slug===item.slug);
  else if(!item.sku&&item.fields.name)matches=catalog.filter(p=>canonical(p.name)===canonical(item.fields.name));
  return matches.length===1?matches[0]:null;
}
export function identityConflict(item,record){return Boolean((item.id&&item.id!==record.id)||(item.slug&&item.slug!==record.slug)||(item.sku&&!record.variants?.some(v=>v.sku===item.sku)));}
export const slugify=v=>normalize(v).normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,80).replace(/-+$/,'');
export function batchPayload(item,defaults={}){
  if(item.error)throw new Error(item.error);if(item.mode==='UPDATE'&&!item.record)throw new Error('Choose the existing HIDI product to update.');
  if(!item.selected.size)throw new Error('Select at least one detail to save.');
  const body=detailsPayload(item.mode==='UPDATE'?item.record:null,item.fields,item.selected);
  const limits={name:160,shortDescription:400,description:10000,fabric:300,care:2000};
  for(const [k,max]of Object.entries(limits)){if(body[k]!=null){body[k]=normalize(body[k]);if(body[k].length>max||/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(body[k]))throw new Error(k+' is too long or contains invalid characters (maximum '+max+').');}}
  if(!body.name)throw new Error('Product name is required.');
  if(item.mode==='NEW'){
    const color=normalize(item.color||defaults.color),sizeList=item.sizes.length?item.sizes:sizes(defaults.sizes||'');
    if(!color||color.length>40||!slugify(color))throw new Error('New draft needs an English colour name (up to 40 characters).');
    if(!sizeList.length||sizeList.length>15||sizeList.some(s=>s.length>20||!slugify(s)))throw new Error('New draft needs 1–15 valid sizes.');
    if(new Set(sizeList.map(slugify)).size!==sizeList.length)throw new Error('Sizes produce duplicate SKUs.');
    const price=pricePaise(item.price||defaults.price||''),mrp=pricePaise(item.mrp||defaults.mrp||'');if(price>mrp)throw new Error('Selling price cannot exceed MRP.');
    const slug=item.slug||slugify(body.name);if(!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)||slug.length>100)throw new Error('Set a valid product_slug in the file.');
    Object.assign(body,{colors:[{name:color,hex:null}],sizes:sizeList,pricePaise:price,mrpPaise:mrp,weightGrams:null,slug});
  }
  return body;
}
export function duplicateTargets(items,payloads){const seen=new Map(),errors=new Map();for(let i=0;i<items.length;i++){const key=items[i].mode==='NEW'?'slug:'+payloads[i]?.slug:'id:'+items[i].record?.id;if(!payloads[i])continue;if(seen.has(key)){errors.set(i,'Duplicate product in this batch.');errors.set(seen.get(key),'Duplicate product in this batch.');}else seen.set(key,i);}return errors;}
// Stable creation IDs let a retry of identical approved data use the API's idempotency check.
export async function creationId(payload){const bytes=new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode('hidi-product-details-v1:'+JSON.stringify(payload))));bytes[6]=(bytes[6]&15)|64;bytes[8]=(bytes[8]&63)|128;const h=[...bytes.slice(0,16)].map(v=>v.toString(16).padStart(2,'0')).join('');return h.slice(0,8)+'-'+h.slice(8,12)+'-'+h.slice(12,16)+'-'+h.slice(16,20)+'-'+h.slice(20);}
export function alreadyApplied(record,payload){return ['name','categoryId','shortDescription','description','fabric','care'].every(k=>(record[k]||null)===(payload[k]||null))&&JSON.stringify((record.collections||[]).map(c=>c.collectionId).sort())===JSON.stringify([...payload.collectionIds].sort());}
