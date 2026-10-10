"""Add Image SKU mapping to the retained importer without rebuilding the site."""
import hashlib
import re
from pathlib import Path

HERE = Path(__file__).resolve().parent
ID = r'[A-Za-z_$][\w$]*'
IMPORT = 'apps/web/.next/server/app/admin/import/page.js'
MANIFEST = 'apps/web/.next/server/app/admin/import/page_client-reference-manifest.js'
PHOTO = 'apps/web/.next/server/app/api/admin/inventory/[variantId]/images/route.js'
CLIENT = '/admin-tools-assets/image-sku-client.mjs'

def once(text, old, new):
    assert text.count(old) == 1, 'Image SKU runtime anchor differs: ' + old[:100]
    return text.replace(old, new)

def native(text):
    if 'hidiImageSkusSaved' in text:
        for name,count in [('preflightMappings',1),('saveImageSku',1),('prepareMappedPhotos',2),('uploadMappedPhotoCandidate',1)]:assert text.count('.'+name+'(')==count,'Previously installed Image SKU hooks differ'
        return text
    start = re.search(r'function (?P<fn>' + ID + r')\((?P<sheet>' + ID + r')\)\{let (?P<rows>' + ID + r')=(?P=sheet)\.map\(\((?P<raw>' + ID + r'),(?P<index>' + ID + r')\)=>\{let ' + ID + r'=(?P<take>' + ID + r')\((?P=raw),"product_name","product"\)', text)
    assert start, 'Product row normalizer missing'
    end = text.index('function ', start.end())
    body = text[start.start():end]
    match = re.search(r'openingQty:0,sku:(?P<sku>' + ID + r'),errors:\[\]', body); assert match
    body = once(body, match[0], match[0].replace(',errors:[]', ',imageSku:' + start['take'] + '(' + start['raw'] + ',"image_sku","photo_sku","image_code","photo_code"),errors:[]'))
    core = (HERE.parent / 'admin-tools/image-sku-client.mjs').read_text().split('async function request(', 1)[0]
    core = core.replace('export ', '').split('\n', 1)[1]
    body = once(body, 'return ' + start['rows'] + '}', 'return(function(){' + core + ';return validateImageSkuRows(' + start['rows'] + ')})()}')
    text = text[:start.start()] + body + text[end:]

    start = re.search(r'async function ' + ID + r'\(\)\{if\([^;]+window\.confirm\(`Import ', text); assert start
    end = text.index('async function ', start.end()); body = text[start.start():end]
    body = once(body, 'hidiFailedProducts=new Set;', 'hidiFailedProducts=new Set,hidiImageSkusSaved=new Set;')
    found = re.search(r'let (?P<product>' + ID + r')=await ' + ID + r'\((?P<row>' + ID + r')\.productSlug,' + ID + r'\)', body); assert found
    loop = re.search(r'for\(let ' + ID + r'=0;' + ID + r'<(?P<rows>' + ID + r')\.length;', body); assert loop
    body = once(body, '));try{let ', '));try{await(await import("' + CLIENT + '")).preflightMappings(' + loop['rows'] + ');let ')
    stock = re.search(r'let ' + ID + r'=await ' + ID + r'\(' + ID + r'\.id,' + re.escape(found['row']) + r'\.openingQty,' + ID + r'\);' + ID + r'\.push\(\{row:' + re.escape(found['row']) + r'\.rowNumber', body); assert stock
    body = body[:stock.start()] + 'if(' + found['row'] + '.imageSku&&!hidiImageSkusSaved.has(' + found['row'] + '.imageSku)){await(await import("' + CLIENT + '")).saveImageSku(' + found['row'] + ',' + found['product'] + ');hidiImageSkusSaved.add(' + found['row'] + '.imageSku)}' + body[stock.start():]
    needle = 'message:`${' + found['product'] + '.name}'
    body = once(body, needle, 'message:`${' + found['row'] + '.imageSku?"Image SKU "+' + found['row'] + '.imageSku+" · ":""}${' + found['product'] + '.name}')
    text = text[:start.start()] + body + text[end:]

    files = re.search(r'return (?P<files>' + ID + r')\.map\((?P<file>' + ID + r')=>(?P<candidate>' + ID + r')\((?P=file),(?P=file)\.name,(?P<variants>' + ID + r')\)\)\}async function', text); assert files
    replacement = 'return(await import("' + CLIENT + '")).prepareMappedPhotos(' + files[0].split('}async function')[0][7:] + ')}async function'
    text = once(text, files[0], replacement)
    zipcode = text.index('ZIP contains ${')
    zipreturn = re.search(r'return (?P<rows>' + ID + r')\}', text[zipcode:]); assert zipreturn
    offset = zipcode + zipreturn.start()
    text = text[:offset] + zipreturn[0].replace('return ' + zipreturn['rows'], 'return(await import("' + CLIENT + '")).prepareMappedPhotos(' + zipreturn['rows'] + ')') + text[offset + len(zipreturn[0]):]
    upload = re.search(r'async function ' + ID + r'\((?P<item>' + ID + r'),(?P<colour>' + ID + r')\)\{if\(!(?P=item)\.variantId', text); assert upload
    offset = text.index('{', upload.start()) + 1
    text = text[:offset] + 'if(' + upload['item'] + '.imageSku)return(await import("' + CLIENT + '")).uploadMappedPhotoCandidate(' + upload['item'] + ');' + text[offset:]

    for old, new in [('FULL-SKU_01.jpg', 'KUR_001_1.jpeg'), ('FULL-SKU_02.jpg', 'KUR_001_2.webp'), ('Bulk SKU photos', 'Bulk product photos'), ('Use the exact HIDI SKU first, then an underscore and sequence number.', 'Add image_sku to the product Excel, for example KUR_001. Numbered photos automatically attach to all sizes of that colour. Existing HIDI SKU filenames also work.')]:
        text = once(text, old, new)
    text = once(text, '"opening_qty","sku"]', '"opening_qty","sku","image_sku"]')
    return text

def patch_web(base, overlay):
    base, overlay = Path(base), Path(overlay)
    original = {file.relative_to(base).as_posix(): file.read_text() for file in (base / 'apps/web/.next').rglob('*') if file.is_file() and not file.is_symlink() and file.suffix in {'.js', '.json', '.html', '.rsc', '.meta'}}
    paths = set(re.findall(r'static/chunks/app/admin/import/page-[a-f0-9]{16}\.js', original[MANIFEST])); assert len(paths) == 1
    browser = 'apps/web/.next/' + paths.pop(); semantic = dict(original)
    for name in (IMPORT, browser): semantic[name] = native(original[name])
    mapping = {}
    for _ in range(8):
        final = {}
        for name, value in semantic.items():
            for old, new in mapping.items(): value = value.replace(re.search(r'-([a-f0-9]{16})\.js$', old)[1], re.search(r'-([a-f0-9]{16})\.js$', new)[1])
            final[name] = value
        updated = {}
        for name, value in final.items():
            if name.startswith('apps/web/.next/static/') and name.endswith('.js') and value != original[name]:
                match = re.search(r'-([a-f0-9]{16})\.js$', name); assert match
                updated[name] = name[:match.start(1)] + hashlib.sha256(value.encode()).hexdigest()[:16] + name[match.end(1):]
        if updated == mapping: break
        mapping = updated
    else: raise AssertionError('Image SKU asset references did not settle')
    files = {mapping.get(name, name): value for name, value in final.items() if value != original[name]}
    photo = original[PHOTO]
    keyfn = re.search(r'function (?P<fn>'+ID+r')\((?P<variant>'+ID+r'),(?P<mime>'+ID+r')\)\{let (?P<clean>'+ID+r')=(?P=variant)\.toLowerCase\(\).*?return`products/variants/\$\{(?P=clean)\}/',photo); assert keyfn
    photo = once(photo, keyfn[0], keyfn[0].replace('('+keyfn['variant']+','+keyfn['mime']+')','('+keyfn['variant']+','+keyfn['mime']+',hidiUploadKey)'))
    insert = photo.index('return`products/variants/${'+keyfn['clean']+'}/')
    expression = 'if(hidiUploadKey)return`products/variants/${'+keyfn['clean']+'}/batch-${hidiUploadKey}.${({"image/jpeg":"jpg","image/png":"png","image/webp":"webp","image/avif":"avif"})['+keyfn['mime']+']??"jpg"}`;'
    photo = photo[:insert]+expression+photo[insert:]
    sha = re.search(r'function (?P<fn>'+ID+r')\('+ID+r'\)\{return\(0,'+ID+r'\.createHash\)\("sha256"\)',photo); assert sha
    target = re.search(r'await (?P<ticket>'+ID+r')\((?P<request>'+ID+r'),(?P<variant>'+ID+r'),(?P<file>'+ID+r')\);let '+ID+r'="azure"===process\.env\.MEDIA_STORAGE_PROVIDER\?await \(0,'+ID+r'\.i\)\('+re.escape(keyfn['fn'])+r'\((?P=variant),(?P=file)\.type\)',photo); assert target
    form = re.search(r'let (?P<form>'+ID+r')=await '+re.escape(target['request'])+r'\.formData\(\)',photo); assert form
    prefix='let hidiUploadKey,hidiImageSku=String('+form['form']+'.get("imageSku")??"");if(hidiImageSku){let hidiPhotoNumber=String('+form['form']+'.get("photoNumber")??"");if(!/^[A-Z][A-Z0-9]*(?:[_-][A-Z0-9]+)*$/.test(hidiImageSku)||hidiImageSku.length>64||!/^[1-9]\\d{0,3}$/.test(hidiPhotoNumber))throw Error("Invalid Image SKU or photo number");if(process.env.MEDIA_STORAGE_PROVIDER!=="azure")throw Error("Image SKU uploads require the configured Azure photo storage");hidiUploadKey='+sha['fn']+'([hidiImageSku,hidiPhotoNumber,'+target['file']+'.type,'+sha['fn']+'(Buffer.from(await '+target['file']+'.arrayBuffer()))].join("\\u0000"));}'
    photo = photo[:target.start()]+prefix+photo[target.start():]
    photo = once(photo,keyfn['fn']+'('+target['variant']+','+target['file']+'.type),Buffer.from(await ',keyfn['fn']+'('+target['variant']+','+target['file']+'.type,hidiUploadKey),Buffer.from(await ')
    files[PHOTO] = photo
    handler = (base / 'admin-tools/handler.mjs').read_text()
    if 'createImageSkuHandler' not in handler:
        handler = once(handler, "import { createProductDeletionHandler } from './product-delete-handler.mjs';", "import { createProductDeletionHandler } from './product-delete-handler.mjs';\nimport {createImageSkuHandler} from './image-sku-handler.mjs';")
        handler = once(handler, "'admin-tools.css',", "'image-sku-client.mjs','admin-tools.css',")
        handler = once(handler, 'let deletionHandler;', 'let deletionHandler,imageSkuHandler;')
        handler = once(handler, 'options={}){', "options={}){\n  if(pathname==='/api/hidi/product-image-skus'||pathname==='/api/hidi/product-image-skus/preflight'){imageSkuHandler??=createImageSkuHandler(options);return imageSkuHandler(request,response,pathname);}")
    else:assert "imageSkuHandler??=createImageSkuHandler(options)" in handler and "'image-sku-client.mjs'" in handler,'Installed Image SKU handler differs'
    files['admin-tools/handler.mjs'] = handler
    navigation = (base / 'admin-tools/navigation.js').read_text()
    files['admin-tools/navigation.js'] = navigation if "'opening_qty','sku','image_sku']" in navigation else once(navigation, "'opening_qty','sku']", "'opening_qty','sku','image_sku']")
    for name in ('image-sku-client.mjs', 'image-sku-handler.mjs', 'image-sku-store.mjs'): files['admin-tools/' + name] = (HERE.parent / 'admin-tools' / name).read_text()
    for name, value in files.items():
        target = overlay / name; target.parent.mkdir(parents=True, exist_ok=True); target.write_text(value)
    return {'passed': True, 'allowedFiles': sorted(files), 'renamedAssets': mapping, 'oldAssetsRetained': True, 'imageSkuPersistence': 'Azure Blob', 'apiUnchanged': True, 'sqlSchemaChanged': False}
