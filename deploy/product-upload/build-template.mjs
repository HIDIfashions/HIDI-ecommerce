// Run from a private temporary directory with node_modules linked to
// CODEX_PRIMARY_RUNTIME_NODE_MODULES. Copy this builder there first.
// Usage: CODEX_PRIMARY_RUNTIME_NODE build-template.mjs OUTPUT_DIR REPO_ROOT
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
import { SpreadsheetFile, Workbook } from '@oai/artifact-tool';

const outputDir = path.resolve(process.argv[2] || 'outputs/hidi-product-upload-template');
const repoRoot = path.resolve(process.argv[3] || process.cwd());
const expectedHeaders = ['action','product_key','product_id','skn','product_slug','product_name','category','collection_slugs','ananyas_pick','short_description','description','fabric','care','includes','fit','lining','model','color','color_hex','size','selling_price','mrp','weight_grams','active','bust_mm','waist_mm','hip_mm','shoulder_mm','sleeve_length_mm','garment_length_mm','image_sku','photo_names','main_photo','photo_alt'];
const model = await import(pathToFileURL(path.join(repoRoot, 'deploy/product-upload/model.mjs')));
assert.deepEqual(model.SIMPLE_UPLOAD_HEADERS || model.HEADERS, expectedHeaders, 'Template headers must match the actual uploader.');

const brown = '#591D20', beige = '#FBF6F2', tan = '#F0E4D7', gold = '#E8C06F', muted = '#765D58';
const wb = Workbook.create();
const products = wb.worksheets.add('Products');
const instructions = wb.worksheets.add('Instructions');
const guide = wb.worksheets.add('Field guide');
const examples = wb.worksheets.add('Examples');
const col = index => { let n = index + 1, result = ''; while (n) { const r = (n - 1) % 26; result = String.fromCharCode(65 + r) + result; n = Math.floor((n - 1) / 26); } return result; };
const end = col(expectedHeaders.length - 1);
const mandatory = new Set(['action', 'product_name', 'color', 'size', 'selling_price', 'mrp']);
const numeric = new Set(['selling_price','mrp','weight_grams','bust_mm','waist_mm','hip_mm','shoulder_mm','sleeve_length_mm','garment_length_mm']);

function base(sheet, range) {
  sheet.showGridLines = false;
  sheet.getRange(range).format = { fill: beige, font: { name: 'Arial', size: 10, color: brown }, verticalAlignment: 'center' };
}
function header(sheet, range) {
  sheet.getRange(range).format = { fill: brown, font: { name: 'Arial', size: 10, bold: true, color: '#FFFFFF' }, verticalAlignment: 'center', horizontalAlignment: 'center', wrapText: true, rowHeight: 32, borders: { insideVertical: { style: 'thin', color: '#FFFFFF' } } };
}
function title(sheet, text, lastCol) {
  sheet.getRange('A2').values = [[text]];
  sheet.getRange('A2').format.font = { name: 'Arial', size: 14, bold: true, color: brown };
  sheet.getRange(`A3:${lastCol}3`).format.borders = { bottom: { style: 'thin', color: brown } };
}
function inputSheet(sheet, rows, blank = false) {
  base(sheet, `A1:${end}${blank ? 26 : rows.length + 1}`);
  sheet.getRange(`A1:${end}1`).values = [expectedHeaders];
  header(sheet, `A1:${end}1`);
  sheet.getRange(`A1:${end}1`).format.rowHeight = 40;
  if (rows.length) sheet.getRange(`A2:${end}${rows.length + 1}`).values = rows;
  sheet.getRange(`A2:${end}${blank ? 26 : rows.length + 1}`).format.rowHeight = 24;
  expectedHeaders.forEach((name, i) => {
    const letter = col(i), width = ['description','short_description','care','photo_names','photo_alt'].includes(name) ? 34 : ['product_name','product_slug','collection_slugs','main_photo'].includes(name) ? 27 : ['product_id','product_key','image_sku'].includes(name) ? 24 : Math.max(13, Math.min(23, name.length + 3));
    sheet.getRange(`${letter}1:${letter}${blank ? 26 : rows.length + 1}`).format.columnWidth = width;
    sheet.getRange(`${letter}2:${letter}5001`).setNumberFormat(numeric.has(name) ? (name === 'selling_price' || name === 'mrp' ? '0.00' : '0') : '@');
    sheet.getRange(`${letter}2:${letter}${blank ? 26 : rows.length + 1}`).format.horizontalAlignment = numeric.has(name) ? 'right' : 'left';
    if (mandatory.has(name)) sheet.getRange(`${letter}1`).format = { fill: gold, font: { name: 'Arial', size: 10, bold: true, color: brown }, horizontalAlignment: 'center', verticalAlignment: 'center', wrapText: true, rowHeight: 40 };
  });
  sheet.freezePanes.freezeRows(1);
  sheet.freezePanes.freezeColumns(2);
  sheet.tabColor = blank ? brown : tan;
}
inputSheet(products, [], true);

function validateList(name, values) {
  const c = col(expectedHeaders.indexOf(name));
  products.getRange(`${c}2:${c}5001`).dataValidation = { rule: { type: 'list', values } };
}
validateList('action', ['NEW','UPDATE']);
validateList('category', ['Casual Wear','Work Wear','Occasional Wear']);
validateList('size', ['M','L','XL','XXL']);
validateList('ananyas_pick', ['TRUE','FALSE']);
validateList('active', ['TRUE','FALSE']);
for (const [name, min, max] of [['weight_grams',1,100000],['bust_mm',200,3000],['waist_mm',200,3000],['hip_mm',200,3000],['shoulder_mm',100,1000],['sleeve_length_mm',50,1500],['garment_length_mm',100,2500]]) {
  const c = col(expectedHeaders.indexOf(name));
  products.dataValidations.add({ range: `${c}2:${c}5001`, rule: { type: 'whole', operator: 'between', formula1: min, formula2: max } });
}
for (const name of ['selling_price','mrp']) {
  const c = col(expectedHeaders.indexOf(name));
  products.dataValidations.add({ range: `${c}2:${c}5001`, rule: { type: 'decimal', operator: 'between', formula1: 0.01, formula2: 1000000 } });
}

const steps = [
  ['1. Fill Products', 'Keep this first sheet and its row 1 headings. Add one row for every product, colour and size. Gold headings are required for NEW rows.'],
  ['2. Group sizes', 'Use the same product_key for every row of one product. Repeat product details exactly. Use one image_sku for every size of the same colour.'],
  ['3. Choose Excel and photos', 'Save as .xlsx. In Product Upload, select this workbook and the matching image files or image folder. Images are selected separately, not embedded in Excel.'],
  ['4. Review the preview', 'Check product identity, prices, sizes, category, collections and photo matches. Correct all validation errors before saving.'],
  ['5. Save as draft', 'Save the reviewed new products and images as drafts. Draft products are hidden from customers. New variants start with zero stock.'],
  ['6. Publish storefront', 'Publish only after product details, sizes and intended photos have completed successfully. Each product needs valid pricing and at least one photo.'],
  ['Existing live products', 'UPDATE edits to an ACTIVE product appear on the storefront immediately. Saving an ACTIVE product as DRAFT removes it from the storefront. Review this before changing publication status.'],
  ['Stock', 'This tool does not add or replace stock. Use Receive Stock after creating new products. Existing quantities, reservations and stock history stay unchanged.'],
  ['Update safely', 'Use UPDATE with the exact product_id, five-digit SKN or existing product_slug. Blank cells retain saved data. A new colour or size adds a zero-stock variant and requires selling_price and mrp.'],
  ['Photo naming', 'For image_sku KUR_001 use KUR_001_1.jpeg, KUR_001_2.jpeg and so on. One code identifies one product colour. Photo numbers must be unique.'],
  ['Photo list', 'Optional photo_names lists exact filenames, separated by semicolons. Repeat the same list on every size row for that colour. All listed files must be selected.'],
  ['Main photo', 'For new products and empty colour galleries, main_photo uploads first and becomes the cover. Existing UPDATE covers are retained. Choosing a different existing cover is blocked before saving.'],
  ['Photo limits', 'Use JPEG/JPG, PNG, WebP or AVIF, up to 12 MiB per file. Renaming an extension does not convert an image. Upload no more than 1,000 photos per batch.'],
  ['Collections', 'Enter exact available storefront collection slugs separated by semicolons, for example everyday;ananyas-pick. The tool validates them against current website options.'],
  ["Ananya's Pick", 'Set ananyas_pick TRUE to add the tag or FALSE to remove it. Leave blank on UPDATE to retain the current choice.'],
  ['Measurements', 'Enter whole millimetres. Example: 100 cm = 1,000 mm. Leave unknown measurements blank. Bust, waist and hip are garment circumferences.'],
  ['Batch size', 'Up to 500 products and 5,000 variant rows per upload, with at most 200 variants per product. Dropdowns and numeric validation are prepared through row 5,001.'],
  ['Examples', 'The Examples sheet contains invented sample data for reference only. It is not imported. Keep actual product rows on Products.'],
  ['All supported details', 'Use Field guide for every uploadable column. GST, HSN, supplier cost, reviews and stock changes are managed separately and are not columns in this template.'],
];
base(instructions, 'A1:B25');
title(instructions, 'HIDI product upload', 'B');
instructions.getRange('A5:B5').values = [['Step or topic','What to do']];
header(instructions, 'A5:B5');
instructions.getRange(`A6:B${steps.length + 5}`).values = steps;
instructions.getRange('A1:A25').format.columnWidth = 28;
instructions.getRange('B1:B25').format.columnWidth = 100;
instructions.getRange('A6:A24').format.font.bold = true;
instructions.getRange('B6:B24').format.wrapText = true;
instructions.getRange('A6:B24').format.rowHeight = 46;
instructions.getRange('A12:B12').format.fill = tan;
instructions.tabColor = muted;

const fields = [
 ['action','Required','Required','NEW or UPDATE','NEW'],
 ['product_key','Recommended','Recommended','One stable grouping key for all colour/size rows. Letters, digits, underscores or hyphens, up to 100 characters. Blank uses the product identity.','sample-ivory-kurta'],
 ['product_id','Leave blank','Identity option','Exact existing HIDI product ID. Use product_id, SKN or existing product_slug for UPDATE.','From product export'],
 ['skn','Leave blank','If available','Optional existing five-digit number, only if returned by your current catalogue. Leave blank for NEW. Use product_id or product_slug for reliable UPDATE matching.','12345'],
 ['product_slug','Optional','Identity option','NEW URL: lowercase English letters, numbers and hyphens, up to 100 characters. UPDATE: lookup only; the URL is not changed.','sample-ivory-kurta'],
 ['product_name','Required','Blank retains','Customer-facing product name, up to 160 characters. Repeat the same value for every row of one product.','Sample Ivory Kurta'],
 ['category','Optional','Blank retains','Choose an existing category. Standard choices: Casual Wear, Work Wear, Occasional Wear. Unknown categories are not created automatically.','Casual Wear'],
 ['collection_slugs','Optional','Blank retains','Exact active collection slugs, separated by semicolons. Maximum 20 collections. Check current website options in the preview.','everyday;ananyas-pick'],
 ['ananyas_pick','Optional','Blank retains','TRUE adds Ananya’s Pick. FALSE removes it. Avoid conflicting values in collection_slugs.','TRUE'],
 ['short_description','Optional','Blank retains','Short product summary, up to 400 characters.','A light cotton kurta for everyday wear.'],
 ['description','Optional','Blank retains','Full product description, up to 10,000 characters including the labelled facts below. New lines are supported within a cell.','Cotton kurta with side pockets.'],
 ['fabric','Optional','Blank retains','Fabric description, up to 300 characters. For sets, specify the fabric of each piece when it differs.','Cotton'],
 ['care','Optional','Blank retains','Wash and care instructions, up to 2,000 characters.','Gentle hand wash separately.'],
 ['includes','Optional','Blank retains','Included garments/components, up to 1,000 characters. Saved as an Includes: line in the full description.','1 kurta'],
 ['fit','Optional','Blank retains','Fit description, up to 1,000 characters. Saved as a Fit: line in the full description.','Relaxed fit'],
 ['lining','Optional','Blank retains','Lining detail, up to 1,000 characters. Saved as a Lining: line in the full description.','Unlined'],
 ['model','Optional','Blank retains','Model/size note, up to 1,000 characters. Saved as a Model: line in the full description.','Model wears size M.'],
 ['color','Required','For variant changes','English colour name, up to 40 characters. Enter with size for variant or photo changes; leave both blank for product details only.','Ivory'],
 ['color_hex','Optional','For new colours','Six-digit colour hex starting with #. NEW products or newly added colours only. Existing colour hex cannot be changed here; leave blank to retain it.','#F3EBDD'],
 ['size','Required','For variant changes','One size per row, entered with colour. Standard sizes: M, L, XL, XXL. Up to 20 characters; duplicate colour/size rows are rejected.','M'],
 ['selling_price','Required','For new variants','Rupees, 0.01–1,000,000, at most two decimal places. No ₹ sign or commas. Must not exceed MRP. Blank retains an existing variant’s price.','1799.00'],
 ['mrp','Required','For new variants','MRP in rupees, 0.01–1,000,000, at most two decimal places. No ₹ sign or commas. Blank retains an existing variant’s MRP.','2199.00'],
 ['weight_grams','Optional','Blank retains','Whole grams from 1 to 100,000. Use the packed/shipping weight if known.','350'],
 ['active','Optional','Blank retains','TRUE enables the size/SKU. FALSE disables it. NEW defaults to TRUE. Product draft/publish is chosen in the tool, not here.','TRUE'],
 ['bust_mm','Optional','Blank retains','Whole millimetres from 200 to 3,000. Garment bust circumference.','1000'],
 ['waist_mm','Optional','Blank retains','Whole millimetres from 200 to 3,000. Garment waist circumference.','920'],
 ['hip_mm','Optional','Blank retains','Whole millimetres from 200 to 3,000. Garment hip circumference.','1080'],
 ['shoulder_mm','Optional','Blank retains','Whole millimetres from 100 to 1,000.','380'],
 ['sleeve_length_mm','Optional','Blank retains','Whole millimetres from 50 to 1,500.','450'],
 ['garment_length_mm','Optional','Blank retains','Whole millimetres from 100 to 2,500.','1100'],
 ['image_sku','Required with photos','Required with photos','Unique code for one product colour, repeated across all its sizes. Start with a letter; letters, digits, underscores and hyphens; maximum 64 characters.','KUR_001'],
 ['photo_names','Optional','Optional','Exact image filenames separated by semicolons. Blank uses the matching image_sku filename prefix. This is not a URL column.','KUR_001_1.jpeg;KUR_001_2.jpeg'],
 ['main_photo','Optional','Optional','Exact selected filename. NEW or empty galleries use it as the first cover. Existing UPDATE covers are retained. If photo_names is filled, include this filename.','KUR_001_1.jpeg'],
 ['photo_alt','Optional','Optional','Description for accessibility, up to 1,000 characters. The tool generates product/colour/photo text when blank.','Ivory cotton kurta, front view'],
];
assert.deepEqual(fields.map(v => v[0]), expectedHeaders);
base(guide, 'A1:E40');
title(guide, 'Upload field guide', 'E');
guide.getRange('A4').values = [['Blank UPDATE cells retain saved values. Repeat shared product and colour details consistently across size rows.']];
guide.getRange('A4').format.font = { name: 'Arial', size: 10, italic: true, color: muted };
guide.getRange('A6:E6').values = [['Column heading','NEW product','UPDATE product','Format and meaning','Example']];
header(guide, 'A6:E6');
guide.getRange('A7:E40').values = fields;
guide.getRange('A1:A40').format.columnWidth = 24;
guide.getRange('B1:C40').format.columnWidth = 22;
guide.getRange('D1:D40').format.columnWidth = 80;
guide.getRange('E1:E40').format.columnWidth = 44;
guide.getRange('D7:E40').format.wrapText = true;
guide.getRange('A7:E40').format.rowHeight = 44;
guide.getRange('A7:A40').format.font.bold = true;
guide.freezePanes.freezeRows(6);
guide.tabColor = tan;

const row = data => expectedHeaders.map(name => data[name] ?? null);
const sampleProduct = {action:'NEW',product_key:'sample-ivory-kurta',product_slug:'sample-ivory-kurta',product_name:'Sample Ivory Kurta',category:'Casual Wear',collection_slugs:'everyday',ananyas_pick:'FALSE',short_description:'An invented example for filling this template.',description:'Cotton kurta with side pockets.',fabric:'Cotton',care:'Gentle hand wash separately.',includes:'1 kurta',fit:'Relaxed fit',lining:'Unlined',model:'Model wears size M.',color:'Ivory',color_hex:'#F3EBDD',selling_price:1799,mrp:2199,weight_grams:350,active:'TRUE',sleeve_length_mm:450,garment_length_mm:1100,image_sku:'KUR_001',photo_names:'KUR_001_1.jpeg;KUR_001_2.jpeg',main_photo:'KUR_001_1.jpeg',photo_alt:'Ivory cotton kurta, front view'};
const sampleRows = [
 row({...sampleProduct,size:'M',bust_mm:1000,waist_mm:920,hip_mm:1080,shoulder_mm:380}),
 row({...sampleProduct,size:'L',bust_mm:1050,waist_mm:970,hip_mm:1130,shoulder_mm:390}),
 row({...sampleProduct,size:'XL',bust_mm:1100,waist_mm:1020,hip_mm:1180,shoulder_mm:400}),
 row({...sampleProduct,size:'XXL',bust_mm:1150,waist_mm:1070,hip_mm:1230,shoulder_mm:410}),
 row({action:'UPDATE',product_key:'sample-update',product_slug:'existing-product-url-from-export',color:'Ivory',size:'M',selling_price:1699,mrp:2199}),
];
inputSheet(examples, sampleRows);
examples.getRange('A9').values = [['Examples only. These invented rows are not imported. Copy your own product rows into Products.']];
examples.getRange('A9').format.font = { name:'Arial', size:10, italic:true, color:muted };
examples.getRange('A10').values = [['The UPDATE example uses a placeholder URL. Replace it with the exact existing product_slug or product_id from your catalogue.']];
examples.getRange('A10').format.font = { name:'Arial', size:10, italic:true, color:muted };

wb.recalculate();
await fs.mkdir(outputDir, {recursive:true});
const checked = await wb.inspect({kind:'table',range:'Products!A1:AH3',include:'values,formulas',tableMaxRows:3,tableMaxCols:34,maxChars:5000});
await fs.writeFile(path.join(outputDir,'template-inspection.ndjson'),checked.ndjson);
const errors = await wb.inspect({kind:'match',searchTerm:'#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A|#NUM!|#NULL!|#SPILL!|#CALC!',options:{useRegex:true,maxResults:100},summary:'Final formula error scan',maxChars:3000});
await fs.writeFile(path.join(outputDir,'formula-error-scan.ndjson'),errors.ndjson);
const renders = [['Products','A1:F10','products-identity'],['Products','G1:Q10','products-details'],['Products','R1:X10','products-variants'],['Products','Y1:AH10','products-measurements-photos'],['Instructions','A1:B24','instructions'],['Field guide','A1:E22','field-guide-1'],['Field guide','A23:E40','field-guide-2'],['Examples','A1:F10','examples-identity'],['Examples','R1:AH7','examples-variants-photos']];
const renderNames=process.env.HIDI_TEMPLATE_RENDER_SCOPE==='main-photo'?['instructions','field-guide-2']:process.env.HIDI_TEMPLATE_RENDER_SCOPE==='identities'?['field-guide-1','examples-identity']:null;
const selectedRenders=renders.filter(([, ,name])=>!renderNames||renderNames.includes(name));
for(const [sheetName,range,name] of selectedRenders) {
  const blob = await wb.render({sheetName,range,scale:1.25,format:'png'});
  await fs.writeFile(path.join(outputDir,`${name}.png`),new Uint8Array(await blob.arrayBuffer()));
}
const file = await SpreadsheetFile.exportXlsx(wb);
const destination = path.join(outputDir,'HIDI_Product_Upload_Template.xlsx');
await file.save(destination);
await fs.copyFile(destination,path.join(repoRoot,'deploy/product-upload/HIDI_Product_Upload_Template.xlsx'));
console.log(JSON.stringify({file:destination,headers:expectedHeaders.length,sheets:['Products','Instructions','Field guide','Examples'],blankProductRows:true,validationRows:5000,renders:selectedRenders.length}));
