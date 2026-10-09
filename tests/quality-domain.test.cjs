const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const webRequire = createRequire(path.resolve(__dirname, '../apps/web/package.json'));
const ts = process.env.HIDI_TYPESCRIPT_MODULE ? require(process.env.HIDI_TYPESCRIPT_MODULE) : webRequire('typescript');
function load(relative, dependencies = {}) {
 const source = fs.readFileSync(path.resolve(__dirname, '../apps/web', relative), 'utf8');
 const module = { exports: {} };
 const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
 vm.runInNewContext(compiled, { module, exports: module.exports, require(id) { if(id in dependencies)return dependencies[id]; throw new Error('Unapproved domain dependency: '+id); } });
 return module.exports;
}
const { filterCatalogue, matchingVariants, priceMatches, matchesProductSearch } = load('lib/catalogue-discovery.ts');
const base = { sizes: [], colors: [], fabrics: [], price: '', sort: 'featured' };
const variant = (id, size, color, pricePaise, available = 3) => ({id, sku:'HIDI-'+id, size, color, pricePaise, mrpPaise:250000, available});
const product = (name, variants, overrides = {}) => ({id:name, slug:name.toLowerCase(),name,collections:[{name:'Work Edit'}],images:[], fabric:'Cotton', inStock:true,minPricePaise:Math.min(...variants.map(v=>v.pricePaise)), variants,...overrides});
const a = product('Aara Café Kurta', [variant('a-m','M','Ivory',149999),variant('a-xl','XL','Wine',210000),variant('a-l','L','Ivory',170000,0)]);
const b = product('Bela Kurta Set', [variant('b-m','M','Wine',150000),variant('b-xl','XL','Ivory',200000)],{fabric:'Linen'});
const sold = product('Cora Kurta', [variant('c-m','M','Ivory',120000,0)],{inStock:false});
const products = [a,b,sold];
const ids = input => Array.from(input, p=>p.id);
test('size and colour intersect on one purchasable SKU, not separate variants', () => {
 assert.deepEqual(ids(filterCatalogue(products,{...base,sizes:['M'],colors:['Wine']})),['Bela Kurta Set']);
 assert.deepEqual(ids(filterCatalogue(products,{...base,sizes:['XL'],colors:['Ivory']})),['Bela Kurta Set']);
});
test('unavailable sizes never satisfy filters', () => assert.equal(filterCatalogue(products,{...base,sizes:['L']}).length,0));
test('multiple choices OR within a group and AND across groups', () => {
 assert.equal(filterCatalogue(products,{...base,sizes:['M','XL'],colors:['Wine','Ivory'],fabrics:['Linen']}).length,1);
});
test('price boundaries are exact paise, without gaps or overlap', () => {
 for(const [value,under,mid,above] of [[149999,true,false,false],[150000,false,true,false],[200000,false,true,false],[200001,false,false,true]]) {
  assert.equal(priceMatches(value,'under1500'),under);assert.equal(priceMatches(value,'1500to2000'),mid);assert.equal(priceMatches(value,'over2000'),above);
 }
});
test('invalid money fails closed', () => { for(const value of [NaN,Infinity,-1,150000.5])assert.equal(priceMatches(value,''),false); });
test('price filters cannot use a cheaper different colour', () => {
 assert.equal(filterCatalogue([a],{...base,colors:['Wine'],price:'under1500'}).length,0);
 assert.equal(filterCatalogue([a],{...base,colors:['Wine'],price:'over2000'}).length,1);
});
test('sort by qualifying variant price is stable and leaves source inventory intact', () => {
 const snapshot = JSON.stringify(products);
 assert.deepEqual(ids(filterCatalogue(products,{...base,colors:['Wine'],sort:'price-low'})),['Bela Kurta Set','Aara Café Kurta']);
 assert.deepEqual(ids(filterCatalogue(products,{...base,colors:['Wine'],sort:'price-high'})),['Aara Café Kurta','Bela Kurta Set']);
 assert.equal(JSON.stringify(products),snapshot);
});
test('clearing filters restores the complete original catalogue including sold-out cards', () => assert.deepEqual(ids(filterCatalogue(products,base)),ids(products)));
test('missing fabric does not falsely satisfy a fabric filter', () => assert.equal(filterCatalogue([{...a,fabric:null}],{...base,fabrics:['Cotton']}).length,0));
test('product-level sold-out flag cannot be bypassed by stale variant counts', () => assert.equal(filterCatalogue([{...a,inStock:false}],{...base,sizes:['M']}).length,0));
test('matchingVariants retains exact SKU identifiers and does not select a size', () => assert.deepEqual(Array.from(matchingVariants(a,{...base,colors:['Wine']}),v=>v.id),['a-xl']));
test('overlay and full search accept reversed multiword queries', () => {assert(matchesProductSearch(a,'wine kurta'));assert(matchesProductSearch(a,'kurta wine'));assert(!matchesProductSearch(b,'kurta peach'));});
test('search handles case, punctuation, repeated spaces and accent folding', () => {for(const q of ['AARA cafe','café   kurta','WORK-EDIT','Kurta, Ivory'])assert(matchesProductSearch(a,q),q);});
test('Workwear Edit search retains the original Work Edit catalogue name and route', () => {
 const workwear = {...a, collections:[{slug:'work-edit',name:'Work Edit'}]};
 const original = JSON.stringify(workwear);
 for(const query of ['Workwear Edit','workwear','Work Edit'])assert(matchesProductSearch(workwear,query),query);
 assert.equal(JSON.stringify(workwear),original);
 assert(!matchesProductSearch({...a,collections:[{slug:'everyday',name:'Everyday'}]},'workwear'));
});
test('empty and punctuation-only search never matches the entire store', () => {for(const q of ['', '   ', '***'])assert.equal(matchesProductSearch(a,q),false);});
test('SKU search works without a product name', () => assert(matchesProductSearch(a,'HIDI a-xl')));
test('unknown price/sort controls do not mutate or discard catalogue', () => assert.deepEqual(ids(filterCatalogue(products,{...base,sort:'unrecognized'})),ids(products)));

const {productFacts, productContentGaps, productNarrative} = load('lib/product-facts.ts');
const guidance = load('lib/shopping-guidance.ts');
const factsProduct = {...a,description:'A studio piece.\nIncludes: Kurta and trousers\nFit: Relaxed\nLining: Unlined\nModel: 174 cm, wearing M',care:'Gentle hand wash',images:[{url:'owned.jpg'}],variants:[{...a.variants[0],bustMm:1100,garmentLengthMm:1120}]};
test('explicit labelled catalogue facts are used without inferring from the name', () => {const f=productFacts(factsProduct);assert.equal(f.includes,'Kurta and trousers');assert.equal(f.fit,'Relaxed');assert.equal(f.lining,'Unlined');assert.equal(f.model,'174 cm, wearing M');});
test('photography and the word set never invent included pieces or fabric', () => {const f=productFacts({...factsProduct,name:'Silk three piece set',fabric:null,description:'A beautiful set.',shortDescription:null});assert.equal(f.includes,null);assert.equal(f.fabric,null);assert.equal(f.fit,null);});
test('labels are case-insensitive and tolerate CRLF and spaces',()=>assert.equal(productFacts({...a,description:'  INCLUDES : Kurta only\r\nFIT: Straight'}).includes,'Kurta only'));
test('empty or misleading in-sentence labels do not become garment facts',()=>assert.equal(productFacts({...a,description:'Our vision includes: imagination'}).includes,null));
test('complete catalogue evidence clears all readiness gaps',()=>assert.equal(productContentGaps(factsProduct).length,0));
test('each available variant needs usable measurements, not only the first size',()=>assert(productContentGaps({...factsProduct,variants:[...factsProduct.variants,{...b.variants[0]}]}).includes('Measurements for every available size')));
test('invalid and zero garment measurements remain a content gap',()=>{for(const value of [0,-1,NaN,Infinity,null])assert(productContentGaps({...factsProduct,variants:[{...factsProduct.variants[0],bustMm:value}]}).includes('Measurements for every available size'));});
test('unavailable variant missing measurements does not prevent complete available stock',()=>assert.equal(productContentGaps({...factsProduct,variants:[...factsProduct.variants,{...b.variants[0],available:0}]}).length,0));
test('published shipping threshold is inclusive and seven-day eligibility is consistent',()=>{assert.equal(guidance.SHIPPING_THRESHOLD_PAISE,149900);assert.equal(guidance.RETURN_WINDOW_DAYS,7);assert.match(guidance.SHIPPING_COPY,/1,499 and above/);});
test('unapproved exchange, dispatch and refund timelines remain explicit gaps',()=>{assert.equal(guidance.LAUNCH_CONTENT_GAPS.length,5);assert.match(guidance.EXCHANGE_COPY,/confirmed/);assert.match(guidance.SHIPPING_TIMELINE,/No delivery date/);assert.match(guidance.REFUND_TIMELINE,/awaiting confirmation/);});
const share = load('lib/product-sharing.ts');
const {publicSupport}=load('lib/public-support.ts',{'./product-sharing':share});
test('public support never falls back to private SMTP or owner email',()=>{const result=publicSupport({SMTP_USER:'owner@example.com',ADMIN_EMAIL:'owner@example.com'});assert.equal(result.email,null);assert.equal(result.phone,null);});
test('an approved email is encoded as a mailto link, not active markup',()=>{const result=publicSupport({HIDI_PUBLIC_SUPPORT_EMAIL:'hello+care@example.com'});assert.equal(result.email,'hello+care@example.com');assert.equal(result.emailHref,'mailto:hello%2Bcare@example.com');});
test('header injection, markup and malformed support contacts are rejected',()=>{for(const value of ['bad','a@example.com\r\nBcc:other@example.com','<script>@example.com','a%0d%0a@example.com'])assert.equal(publicSupport({HIDI_PUBLIC_SUPPORT_EMAIL:value}).email,null);});
test('valid international support phone is normalized, missing phone is not fabricated',()=>{assert.equal(publicSupport({NEXT_PUBLIC_HIDI_WHATSAPP_NUMBER:'919876543210'}).phone,'919876543210');assert.equal(publicSupport({NEXT_PUBLIC_HIDI_WHATSAPP_NUMBER:'123'}).phone,null);});

test("PDP narrative omits labelled facts without losing ordinary descriptive text",()=>assert.equal(productNarrative("A daily favourite.\nIncludes: Kurta only\nFit: Straight\nMade for your day."),"A daily favourite.\nMade for your day."));
