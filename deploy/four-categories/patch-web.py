"""Update the retained customer navigation, headings and category breadcrumbs."""
import hashlib
import importlib.util
import json
from pathlib import Path
import re

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('four_category_web_base', HERE.parent / 'product-skn/patch-web.py')
baseline = importlib.util.module_from_spec(spec); spec.loader.exec_module(baseline)
CATEGORIES = [('casual-wear', 'Casual Wear'), ('work-wear', 'Work Wear'),
              ('occasional-wear', 'Occasional Wear'), ('ananyas-pick', 'Ananya’s Pick')]
HEADER_BEFORE = '[["New Arrivals","/collections/new-arrivals"],["Workwear Edit","/collections/work-edit"],["Everyday","/collections/everyday"],["Occasion","/collections/occasion"],["Shop All","/collections/all"]]'
HEADER_AFTER = json.dumps([[title,'/collections/'+slug] for slug,title in CATEGORIES],ensure_ascii=True,separators=(',',':'))
ID = r'[A-Za-z_$][\w$]*'
CALL = r'\(0,' + ID + r'\.jsx\)'
FOOTER = re.compile(r'(?P<jsx>'+CALL+r')\((?P<link>'+ID+r'\(\)),\{(?P<prefetch>prefetch:!1,)?href:"/collections/new-arrivals",children:"New Arrivals"\}\),(?:'+CALL+r'\('+ID+r'\(\),\{(?:prefetch:!1,)?href:"/collections/(?:work-edit|everyday|occasion)",children:"(?:Workwear Edit|Everyday|Occasion)"\}\),){3}'+CALL+r'\('+ID+r'\(\),\{(?:prefetch:!1,)?href:"/collections/all",children:"Shop All"\}\)')
SEARCH = re.compile(r'"aria-label":"Suggested searches",children:\[(?P<links>(?P<jsx>'+CALL+r')\((?P<link>'+ID+r'\(\)),\{href:"/collections/work-edit",onClick:(?P<click>\(\)=>'+ID+r'\(!1\)),children:"Workwear Edit"\}\),.*?)\]\}\)')
PDP = re.compile(r'(?P<first>'+ID+r')=(?P<product>'+ID+r')\.collections\[0\]\?\?\{slug:"new-arrivals",name:"New Arrivals"\},(?P<second>'+ID+r')="work-edit"===\1\.slug\?\{\.\.\.\1,name:"Workwear Edit"\}:\1')

def sha(text): return hashlib.sha256(text.encode()).hexdigest()

def semantic_patch(name, text):
    before = text; counts = {}
    if HEADER_BEFORE in text:
        counts['header'] = text.count(HEADER_BEFORE); assert counts['header'] == 1
        text = text.replace(HEADER_BEFORE, HEADER_AFTER)
    def footer(m):
        counts['footer'] = counts.get('footer',0)+1
        return ','.join(m['jsx']+'('+m['link']+',{'+(m['prefetch'] or '')+'href:'+json.dumps('/collections/'+slug)+',children:'+json.dumps(title,ensure_ascii=True)+'})' for slug,title in CATEGORIES)
    text = FOOTER.sub(footer, text)
    def search(m):
        counts['search'] = counts.get('search',0)+1
        links = ','.join(m['jsx']+'('+m['link']+',{href:'+json.dumps('/collections/'+slug)+',onClick:'+m['click']+',children:'+json.dumps(title,ensure_ascii=True)+'})' for slug,title in CATEGORIES)
        return m[0].replace(m['links'], links)
    text = SEARCH.sub(search, text)
    if name == baseline.COLLECTION_FILE:
        assert text.count(baseline.CURRENT_LABELS) == 1, 'Retained collection labels differ'
        labels = {'all':{'title':'All Products','copy':'Explore the complete HIDI edit in one place.'},
                  'new-arrivals':{'title':'All Products','copy':'Explore the complete HIDI edit in one place.'},
                  'work-edit':baseline.NEW_LABELS['work-wear'],'everyday':baseline.NEW_LABELS['casual-wear'],
                  'occasion':baseline.NEW_LABELS['occasional-wear'],**baseline.NEW_LABELS}
        text = text.replace(baseline.CURRENT_LABELS,json.dumps(labels,ensure_ascii=True,separators=(',',':')))
        counts['collectionLabels'] = 1
    def pdp(m):
        counts['productBreadcrumb'] = counts.get('productBreadcrumb',0)+1
        groups = {slug:{'slug':slug,'name':title} for slug,title in CATEGORIES}
        for old,new in [('everyday','casual-wear'),('work-edit','work-wear'),('occasion','occasional-wear')]: groups[old] = groups[new]
        product = m['product']
        return m['first']+'=(()=>{const hidiGroups='+json.dumps(groups,ensure_ascii=True,separators=(',',':'))+';return hidiGroups['+product+'.category?.slug??""]??'+product+'.collections.map(hidiRow=>hidiGroups[hidiRow.slug]).find(Boolean)??{slug:"all",name:"All Products"}})(),'+m['second']+'='+m['first']
    text = PDP.sub(pdp,text)
    replacements = [
        ('/collections/work-edit','/collections/work-wear'),('/collections/everyday','/collections/casual-wear'),
        ('/collections/occasion"','/collections/occasional-wear"'),
        ('Workwear Edit / New Arrivals','Work Wear'),('Everyday / New Arrivals','Casual Wear'),
        ('Workwear Edit','Work Wear'),('Shop Workwear Edit','Shop Work Wear'),('Explore Everyday','Explore Casual Wear'),
        ('"Everyday"','"Casual Wear"'),('"Occasion"','"Occasional Wear"'),('"New Arrivals"','"All Products"'),
        ('"New arrivals"','"All Products"'),('"Shop All"','"All Products"'),
    ]
    if '/sitemap.xml/' in name: replacements.append(('/collections/new-arrivals','/collections/ananyas-pick'))
    for old,new in replacements: text = text.replace(old,new)
    if text != before: counts['customerCategoryText'] = 1
    return text,counts

def patch_web(base, overlay):
    base,overlay = Path(base),Path(overlay)
    tree = base / 'apps/web/.next'; assert tree.is_dir(), 'Retained Next build required'
    original = {file.relative_to(base).as_posix():file.read_bytes().decode() for file in tree.rglob('*')
                if file.is_file() and not file.is_symlink() and file.suffix in {'.js','.json','.html','.rsc','.meta'}}
    semantic = dict(original); changes = {}
    for name,value in original.items():
        if not name.endswith('.js') or '/app/admin/' in name or '/app/api/' in name: continue
        patched,counts = semantic_patch(name,value)
        if patched != value: semantic[name] = patched; changes[name] = counts
    assert baseline.COLLECTION_FILE in changes and 'apps/web/.next/server/app/products/[slug]/page.js' in changes, 'Category routes and product breadcrumb required'
    for counter in ('header','footer','search'):
        assert sum(value.get(counter,0) for value in changes.values()) >= 3, 'Server and browser '+counter+' were not updated'
    assert sum(value.get('productBreadcrumb',0) for value in changes.values()) == 1
    mapping = {}
    for _ in range(8):
        final = dict(semantic)
        for name,value in semantic.items():
            for old,new in mapping.items():
                value = value.replace(re.search(r'-([a-f0-9]{16})\.js$',old)[1],re.search(r'-([a-f0-9]{16})\.js$',new)[1])
            final[name] = value
        updated = {}
        for name,value in final.items():
            if name.startswith('apps/web/.next/static/') and name.endswith('.js') and value != original[name]:
                match = re.search(r'-([a-f0-9]{16})\.js$',name); assert match, 'Immutable customer asset hash required'
                updated[name] = name[:match.start(1)] + sha(value)[:16] + name[match.end(1):]
        if updated == mapping: break
        mapping = updated
    else: raise AssertionError('Category asset references did not settle')
    files = {}
    for name,value in final.items():
        if value == original[name]: continue
        target = mapping.get(name,name); assert target == name or not (base/target).exists()
        dest = overlay/target; assert not dest.exists(); dest.parent.mkdir(parents=True,exist_ok=True);dest.write_bytes(value.encode())
        files[target] = {'source':name,'oldSha256':sha(original[name]),'newSha256':sha(value),'changes':changes.get(name,{}),'referenceOnly':name not in changes}
    return {'passed':True,'files':files,'allowedFiles':sorted(files),'renamedAssets':mapping,'oldAssetsRetained':True,'categories':[title for _,title in CATEGORIES],'adminAndUploadCodePreserved':True}
