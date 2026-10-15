// Browser/Node shared input contract. Importing a workbook never changes products.
export const HEADERS = ['action','product_key','product_id','skn','product_slug','product_name','category','collection_slugs','ananyas_pick','short_description','description','fabric','care','includes','fit','lining','model','color','color_hex','size','selling_price','mrp','weight_grams','active','bust_mm','waist_mm','hip_mm','shoulder_mm','sleeve_length_mm','garment_length_mm','image_sku','photo_names','main_photo','photo_alt'];
export const SIMPLE_UPLOAD_HEADERS = HEADERS;
export const MAX_PRODUCTS = 500, MAX_ROWS = 5000, MAX_VARIANTS = 200, MAX_FILES = 1000, MAX_PHOTO_BYTES = Number.MAX_SAFE_INTEGER;
export const clean = value => String(value ?? '').normalize('NFKC').trim();
export const canonical = value => clean(value).replace(/\s+/g,' ').toLowerCase();
export const slugify = value => clean(value).normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,80).replace(/-+$/,'');
export const comboKey = (color,size) => canonical(color)+'\u0000'+canonical(size);
export const validImageSku = value => /^[A-Z][A-Z0-9]*(?:[_-][A-Z0-9]+)*$/.test(value) && value.length <= 64;
export function bool(value,label) { const s=canonical(value); if(!s)return undefined; if(s==='true'||s==='1')return true; if(s==='false'||s==='0')return false; throw new Error(label+' must be TRUE, FALSE or blank.'); }
export function whole(value,label,min,max) { if(!/^\d+$/.test(value))throw new Error(label+' must be a whole number.');const n=Number(value);if(!Number.isSafeInteger(n)||n<min||n>max)throw new Error(label+' must be '+min+'–'+max+'.');return n; }
export function price(value,label) { if(!/^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/.test(value))throw new Error(label+' must be a rupee amount with at most two decimal places.');const [a,b='']=value.split('.');const n=Number(a)*100+Number(b.padEnd(2,'0'));if(!Number.isSafeInteger(n)||n<1||n>100000000)throw new Error(label+' must be ₹0.01–₹10,00,000.');return n; }
export const MEASUREMENTS = {bust_mm:['bustMm',200,3000],waist_mm:['waistMm',200,3000],hip_mm:['hipMm',200,3000],shoulder_mm:['shoulderMm',100,1000],sleeve_length_mm:['sleeveLengthMm',50,1500],garment_length_mm:['garmentLengthMm',100,2500]};
const FIELD_MAP={product_name:'name',short_description:'shortDescription',description:'description',fabric:'fabric',care:'care',includes:'includes',fit:'fit',lining:'lining',model:'model'};
const LIMITS={name:160,shortDescription:400,description:10000,fabric:300,care:2000,includes:1000,fit:1000,lining:1000,model:1000};
function text(value,label,max) { if(value.length>max||/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value))throw new Error(label+' is too long or contains invalid characters (maximum '+max+').');return value; }
function list(value,label) { if(!value)return undefined;const values=value.split(';').map(clean);if(values.some(v=>!v))throw new Error(label+' contains an empty entry.');if(new Set(values.map(v=>v.toLowerCase())).size!==values.length)throw new Error(label+' contains duplicates.');return values; }
function filename(value) { if(!value||value.length>255||/[\u0000-\u001f\u007f/\\]/.test(value)||value==='.'||value==='..')throw new Error('Use exact photo filenames without folder paths.');return value; }
function merge(group,key,value,label,compare=canonical) { if(value===undefined||value==='')return;if(group[key]!==undefined&&compare(group[key])!==compare(value))throw new Error('Conflicting '+label+' for product_key '+group.key+'.');group[key]=value; }
export function parseProducts(sheets) {
  if(!Array.isArray(sheets)||!sheets.length)throw new Error('Choose a product CSV or workbook.');
  const named=sheets.filter(s=>canonical(s.name)==='products');
  const eligible=named.length?named:sheets.filter(s=>!['examples','example','instructions','instruction','field guide','fields'].includes(canonical(s.name)));
  if(named.length>1||(!named.length&&eligible.length!==1))throw new Error('Use one worksheet named Products; Examples and Instructions are ignored.');
  const sheet=eligible[0];if(!sheet||!Array.isArray(sheet.rows))throw new Error('The Products worksheet is empty.');
  const hi=sheet.rows.findIndex(row=>Array.isArray(row)&&row.some(v=>clean(v)));
  if(hi<0)throw new Error('The Products worksheet is empty.');
  const headers=sheet.rows[hi].map(v=>canonical(v).replace(/\s+/g,'_'));
  for(const h of headers)if(h&&!HEADERS.includes(h))throw new Error('Unsupported column '+h+'. Use the supplied template; no product fields are silently discarded.');
  if(new Set(headers.filter(Boolean)).size!==headers.filter(Boolean).length)throw new Error('Duplicate column headings.');
  if(!headers.includes('action'))throw new Error('The action column is required (NEW or UPDATE).');
  const groups=new Map(),errors=[],codes=new Map();let count=0;
  for(let i=hi+1;i<sheet.rows.length;i++) {
    const cells=sheet.rows[i];if(!Array.isArray(cells)||!cells.some(v=>clean(v)))continue;
    if(++count>MAX_ROWS)throw new Error('Import at most '+MAX_ROWS+' variant rows per batch.');
    const source=clean(sheet.name||'Products')+' · row '+(i+1);
    try {
      const row={};cells.forEach((v,c)=>{if(clean(v)&&!headers[c])throw new Error('A value has no supported column heading.');if(headers[c])row[headers[c]]=clean(v);});
      const action=(row.action||'').toUpperCase();if(!['NEW','UPDATE'].includes(action))throw new Error('Action must be NEW or UPDATE.');
      const productSlug=row.product_slug||((action==='NEW'&&row.product_name)?slugify(row.product_name):'');
      if(productSlug&&(!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(productSlug)||productSlug.length>100||productSlug.startsWith('hidi-internal-deleted-')))throw new Error('product_slug must be an available lowercase URL using letters, numbers and hyphens.');
      const key=text(row.product_key||productSlug||row.product_id||row.skn,'product_key',100);
      if(!key||!/^[-A-Za-z0-9_]+$/.test(key))throw new Error('Use a stable product_key made of letters, numbers, underscores or hyphens.');
      if(row.product_id&&!/^[A-Za-z0-9_-]{1,64}$/.test(row.product_id))throw new Error('Invalid product_id.');
      if(row.skn&&!/^[1-9]\d{4}$/.test(row.skn))throw new Error('SKN must be an existing five-digit HIDI number.');
      if(action==='NEW'&&(row.product_id||row.skn))throw new Error('Leave product_id and skn blank for NEW products.');
      if(action==='UPDATE'&&!row.product_id&&!row.skn&&!productSlug)throw new Error('UPDATE needs an exact existing product_id, skn or product_slug.');
      let group=groups.get(key);if(!group){group={key,action,identity:{},fields:{},variants:[],sourceRows:[],warnings:[]};groups.set(key,group);if(groups.size>MAX_PRODUCTS)throw new Error('Import at most '+MAX_PRODUCTS+' products per batch.');}
      if(group.action!==action)throw new Error('Conflicting actions for product_key '+key+'.');
      for(const [k,v]of Object.entries({productId:row.product_id,skn:row.skn,slug:productSlug}))merge(group.identity,k,v,k,v=>clean(v));
      for(const [column,keyName]of Object.entries(FIELD_MAP)) {const value=row[column];if(value) {text(value,column,LIMITS[keyName]);if(group.fields[keyName]!==undefined&&group.fields[keyName]!==value)throw new Error('Conflicting '+column+' for product_key '+key+'.');group.fields[keyName]=value;}}
      merge(group,'category',row.category,'category');
      const collections=list(row.collection_slugs,'collection_slugs');if(collections){if(collections.length>20||collections.some(v=>!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(v)))throw new Error('Use up to 20 exact collection slugs.');merge(group,'collectionSlugs',collections,'collection_slugs',v=>JSON.stringify([...v].sort()));}
      const pick=bool(row.ananyas_pick,'ananyas_pick');merge(group,'ananyaPick',pick,'Ananya’s Pick',v=>String(v));
      const color=text(row.color||'','color',40).replace(/\s+/g,' '),size=text(row.size||'','size',20).replace(/\s+/g,' ').toUpperCase();
      if((color&&!size)||(!color&&size)||action==='NEW'&&(!color||!size))throw new Error('Enter both colour and size for each variant row.');
      if(color&&(!slugify(color)||!slugify(size)))throw new Error('Colour and size need readable English letters or numbers.');
      if(row.color_hex&&!/^#[0-9a-fA-F]{6}$/.test(row.color_hex))throw new Error('color_hex must look like #800000.');
      const supplied={};if(row.selling_price)supplied.pricePaise=price(row.selling_price,'selling_price');if(row.mrp)supplied.mrpPaise=price(row.mrp,'mrp');
      if(action==='NEW'&&(!supplied.pricePaise||!supplied.mrpPaise))throw new Error('NEW variants require selling_price and mrp.');
      if(supplied.pricePaise!==undefined&&supplied.mrpPaise!==undefined&&supplied.pricePaise>supplied.mrpPaise)throw new Error('Selling price cannot exceed MRP.');
      if(row.weight_grams)supplied.weightGrams=whole(row.weight_grams,'weight_grams',1,100000);const active=bool(row.active,'active');if(active!==undefined)supplied.active=active;
      for(const [col,[field,min,max]]of Object.entries(MEASUREMENTS))if(row[col])supplied[field]=whole(row[col],col,min,max);
      const photoNames=(list(row.photo_names,'photo_names')||[]).map(filename),mainPhoto=row.main_photo?filename(row.main_photo):'',imageSku=(row.image_sku||'').toUpperCase();
      if(imageSku&&!validImageSku(imageSku))throw new Error('image_sku needs a unique code such as KUR_001, up to 64 characters.');
      if(mainPhoto&&photoNames.length&&!photoNames.includes(mainPhoto))throw new Error('main_photo must be one of photo_names for that colour.');
      if((photoNames.length||mainPhoto||imageSku||row.photo_alt||Object.keys(supplied).length||row.color_hex)&&!color)throw new Error('Variant and photo details require colour and size.');
      if((photoNames.length||mainPhoto)&&!imageSku)throw new Error('image_sku is required when photo names are supplied.');
      if(color){const variant={color,size,colorHex:row.color_hex?.toUpperCase()||undefined,supplied,photoNames,mainPhoto,imageSku,photoAlt:text(row.photo_alt||'','photo_alt',1000),source};if(group.variants.some(v=>comboKey(v.color,v.size)===comboKey(color,size)))throw new Error('Duplicate colour/size in product_key '+key+'.');group.variants.push(variant);if(group.variants.length>MAX_VARIANTS)throw new Error('At most '+MAX_VARIANTS+' variants per product.');}
      group.sourceRows.push(source);
    }catch(error){errors.push(source+': '+error.message);}
  }
  for(const group of groups.values()) {
    if(group.action==='NEW'&&!group.fields.name)errors.push(group.key+': Product name is required.');
    const colourPlans=new Map(),colourTokens=new Map(),sizeTokens=new Map();for(const v of group.variants){const ck=canonical(v.color),colourToken=slugify(v.color),sizeToken=slugify(v.size);if(colourTokens.has(colourToken)&&colourTokens.get(colourToken)!==ck)errors.push(group.key+': Colour labels produce duplicate generated SKU tokens.');colourTokens.set(colourToken,ck);if(sizeTokens.has(sizeToken)&&sizeTokens.get(sizeToken)!==canonical(v.size))errors.push(group.key+': Size labels produce duplicate generated SKU tokens.');sizeTokens.set(sizeToken,canonical(v.size));let previous=colourPlans.get(ck);if(!previous){previous={};colourPlans.set(ck,previous);}for(const field of ['imageSku','mainPhoto','photoAlt','colorHex'])if(v[field]){if(previous[field]&&previous[field]!==v[field])errors.push(group.key+': Conflicting '+field+' for colour '+v.color+'.');previous[field]=v[field];}
      if(v.imageSku){const target=group.key+'\u0000'+ck;if(codes.has(v.imageSku)&&codes.get(v.imageSku)!==target)errors.push('Image SKU '+v.imageSku+' is used for different products or colours.');codes.set(v.imageSku,target);}}
  }
  const identities=new Map();for(const group of groups.values())for(const [kind,value]of Object.entries(group.identity)){const id=kind+':'+value;if(identities.has(id)&&identities.get(id)!==group.key)errors.push('The same '+kind+' is used by different product_key groups.');identities.set(id,group.key);}
  if(errors.length)throw new Error(errors.slice(0,30).join('\n')+(errors.length>30?'\n… '+(errors.length-30)+' more errors.':''));
  if(!groups.size)throw new Error('The Products sheet has no product rows.');
  return {groups:[...groups.values()],warnings:sheets.filter(s=>s!==sheet).map(s=>'Ignored worksheet: '+s.name)};
}
export function descriptionFields(group,record) { let description=group.fields.description??record?.description??null;for(const [field,label]of [['includes','Includes'],['fit','Fit'],['lining','Lining'],['model','Model']])if(group.fields[field]) {const lines=String(description||'').split(/\r?\n/).filter(line=>!new RegExp('^\\s*'+label+'\\s*:','i').test(line));description=[...lines.filter(Boolean),label+': '+group.fields[field]].join('\n');}if(description&&description.length>10000)throw new Error('Full description with labelled facts exceeds 10,000 characters.');return description; }
export function safeCsv(rows) {return '\ufeff'+rows.map(row=>row.map(value=>{let s=String(value??'');if(/^[\s\u0000-\u001f]*[=+@-]/.test(s))s="'"+s;return '"'+s.replace(/"/g,'""')+'"';}).join(',')).join('\r\n')+'\r\n';}
export function reportCsv(report) {return safeCsv([['product_key','product_name','product_id','intent','stage','result','message'],...(report?.results||[]).map(r=>[r.key,r.name,r.productId,report.intent,r.stage,r.state,r.message])]);}
