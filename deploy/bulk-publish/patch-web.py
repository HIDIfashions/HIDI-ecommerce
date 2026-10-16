"""Narrow edits to retained admin assets; keep every original immutable URL."""
import hashlib
import re
from pathlib import Path

HERE=Path(__file__).resolve().parent
ID=r'[A-Za-z_$][\w$]*'
IMPORT='apps/web/.next/server/app/admin/import/page.js'
MANIFEST='apps/web/.next/server/app/admin/import/page_client-reference-manifest.js'

def once(text,old,new):
    assert text.count(old)==1, 'Retained bulk anchor differs: '+old[:100]
    return text.replace(old,new)

def native(text):
    start=re.search(r'async function '+ID+r'\(\)\{if\([^;]+window\.confirm\(`Import ',text)
    assert start, 'Retained import function missing'
    end=text.index('async function ',start.end())
    body=text[start.start():end]
    found=re.search(r'let (?P<product>'+ID+r')=await (?P<exact>'+ID+r')\((?P<row>'+ID+r')\.productSlug,(?P<cache>'+ID+r')\);if\(!(?P=product)\)\{let '+ID+r'=await (?P<ensure>'+ID+r')\((?P=row)\.category,(?P<options>'+ID+r')\);.*?(?P<api>\(0,'+ID+r'\.G\))\("","POST",',body)
    assert found, 'Retained create/cache contract differs'
    product,row,cache,ensure,options,api=[found[key] for key in ('product','row','cache','ensure','options','api')]
    core=(HERE.parent/'admin-tools/product-publication.mjs').read_text().split('export function importDetails(',1)[1]
    core='function importDetails('+core
    anchor=cache+'.set('+row+'.productSlug,'+product+')}let '
    patch=cache+'.set('+row+'.productSlug,'+product+')}else if(!hidiDetailsSaved.has('+row+'.productSlug)){const hidiCategory='+row+'.category?await '+ensure+'('+row+'.category,'+options+'):{id:'+product+'.categoryId,options:'+options+'};'+options+'=hidiCategory.options;const hidiPayload=('+core+')('+row+','+product+',hidiCategory.id);if(hidiPayload){'+product+'=await '+api+'(`/${encodeURIComponent('+product+'.id)}`,"PATCH",hidiPayload);'+cache+'.set('+row+'.productSlug,'+product+')}}hidiDetailsSaved.add('+row+'.productSlug);let '
    body=once(body,anchor,patch)
    anchor=cache+'=new Map;try{'
    body=once(body,anchor,cache+'=new Map;let hidiDetailsSaved=new Set,hidiFailedProducts=new Set;window.dispatchEvent(new CustomEvent("hidi:bulk-busy",{detail:{busy:true}}));try{')
    failure=re.search(r'catch\('+ID+r'\)\{'+ID+r'\.push\(\{row:'+re.escape(row)+r'\.rowNumber,state:"FAILED"',body)
    assert failure
    pos=body.index('{',failure.start())+1
    body=body[:pos]+'if("NEW"==='+row+'.mode)hidiFailedProducts.add('+row+'.productSlug);'+body[pos:]
    completion=re.search(r',await '+ID+r'\(\)\}catch\('+ID+r'\)\{'+ID+r'\([^;]*"Bulk import stopped unexpectedly\."',body)
    assert completion
    event=',window.dispatchEvent(new CustomEvent("hidi:bulk-products-saved",{detail:{ids:[...'+cache+'.entries()].filter(([hidiSlug,hidiProduct])=>hidiProduct&&!hidiFailedProducts.has(hidiSlug)).map(([,hidiProduct])=>hidiProduct.id)}}))'
    body=body[:completion.start()]+event+body[completion.start():]
    last=body.rfind('(!1)}');assert last>=0
    body=body[:last]+body[last:].replace('(!1)}','(!1),window.dispatchEvent(new CustomEvent("hidi:bulk-busy",{detail:{busy:false}}))}',1)
    body=body.replace('rows processed. Products remain Draft until you publish them.','rows saved. Upload photos, then use Publish products in bulk below. Existing publication status is retained until you choose to publish.')
    text=text[:start.start()]+body+text[end:]
    shape=re.search(r'shortDescription:(?P<fn>'+ID+r')\((?P<row>'+ID+r')\.shortDescription\),fabric:',text)
    assert shape
    text=once(text,shape[0],shape[0].replace(',fabric:',',description:'+shape['row']+'.description.trim(),fabric:'))
    comparison=re.search(r'(?P<a>'+ID+r')\.shortDescription!==(?P<b>'+ID+r')\.shortDescription\|\|',text);assert comparison
    text=once(text,comparison[0],comparison[0]+comparison['a']+'.description!=='+comparison['b']+'.description||')
    photo=re.search(r'let (?P<count>'+ID+r')=0;try\{for\(let '+ID+r'=0;[^}]+sourceName[^}]+',text)
    # Photo completion remains read-only: refresh the batch after any confirmed uploads.
    idx=text.index(' uploaded successfully.')
    finish=re.search(r'finally\{'+ID+r'\(""\),'+ID+r'\(!1\)\}',text[idx:]);assert finish
    count=re.search(r'\$\{('+ID+r')\} photo\$\{',text[max(0,idx-140):idx])[1]
    old=finish[0];new=old[:-1]+';if('+count+')window.dispatchEvent(new CustomEvent("hidi:bulk-photos-saved"));}'
    offset=idx+finish.start();text=text[:offset]+new+text[offset+len(old):]
    return text

def patch_web(base,overlay):
    base,overlay=Path(base),Path(overlay)
    original={f.relative_to(base).as_posix():f.read_text() for f in (base/'apps/web/.next').rglob('*') if f.is_file() and not f.is_symlink() and f.suffix in {'.js','.json','.html','.rsc','.meta'}}
    manifest=original[MANIFEST]
    paths=set(re.findall(r'static/chunks/app/admin/import/page-[a-f0-9]{16}\.js',manifest));assert len(paths)==1
    browser='apps/web/.next/'+paths.pop();semantic=dict(original)
    for name in (IMPORT,browser):semantic[name]=native(original[name])
    mapping={}
    for _ in range(8):
        final={name:value for name,value in semantic.items()}
        for name,value in semantic.items():
            for old,new in mapping.items():value=value.replace(re.search(r'-([a-f0-9]{16})\.js$',old)[1],re.search(r'-([a-f0-9]{16})\.js$',new)[1])
            final[name]=value
        updated={}
        for name,value in final.items():
            if name.startswith('apps/web/.next/static/') and name.endswith('.js') and value!=original[name]:
                match=re.search(r'-([a-f0-9]{16})\.js$',name);assert match
                updated[name]=name[:match.start(1)]+hashlib.sha256(value.encode()).hexdigest()[:16]+name[match.end(1):]
        if updated==mapping:break
        mapping=updated
    else:raise AssertionError('Bulk import asset references did not settle')
    files={}
    for name,value in final.items():
        if value!=original[name]:files[mapping.get(name,name)]=value
    admin={name:(base/'admin-tools'/name).read_text() for name in ('navigation.js','handler.mjs','product-bulk.mjs')}
    line="    const path=location.pathname;if(!path.startsWith('/admin'))return;"
    loader="\n    if(['/admin/import','/admin/product-bulk'].includes(path.replace(/\\/$/,''))&&!document.getElementById('hidi-bulk-publish-loader')){const script=document.createElement('script');script.id='hidi-bulk-publish-loader';script.type='module';script.src='/admin-tools-assets/product-publication-panel.mjs';document.head.append(script);}"
    admin['navigation.js']=once(admin['navigation.js'],line,line+loader)
    admin['handler.mjs']=once(admin['handler.mjs'],"'admin-tools.css','navigation.js'","'admin-tools.css','product-publication.mjs','product-publication-panel.mjs','navigation.js'")
    bulk=admin['product-bulk.mjs']
    bulk=once(bulk,"import {readWorkbook} from './workbook-reader.mjs';","import {readWorkbook} from './workbook-reader.mjs';\nimport './product-publication-panel.mjs';")
    bulk=once(bulk,"document.querySelectorAll('input,select,textarea,button')","document.querySelectorAll('input:not(#hidi-bulk-publish input),select,textarea,button:not(#hidi-bulk-publish button)')")
    bulk=once(bulk,'lock(true);try{await fn();}',"lock(true);window.dispatchEvent(new CustomEvent('hidi:bulk-busy',{detail:{busy:true}}));try{await fn();}")
    bulk=once(bulk,'finally{lock(false);for(const row',"finally{lock(false);window.dispatchEvent(new CustomEvent('hidi:bulk-busy',{detail:{busy:false}}));for(const row")
    bulk=once(bulk,"  const failed=items.filter(r=>r.status==='failed').length;","  window.dispatchEvent(new CustomEvent('hidi:bulk-products-saved',{detail:{ids:items.filter(r=>r.status==='saved').map(r=>r.record.id)}}));\n  const failed=items.filter(r=>r.status==='failed').length;")
    admin['product-bulk.mjs']=bulk
    for name in ('product-publication.mjs','product-publication-panel.mjs'):admin[name]=(HERE.parent/'admin-tools'/name).read_text()
    for name,value in admin.items():files['admin-tools/'+name]=value
    for name,value in files.items():
        target=overlay/name;target.parent.mkdir(parents=True,exist_ok=True);target.write_text(value)
    return {'passed':True,'allowedFiles':sorted(files),'renamedAssets':mapping,'oldAssetsRetained':True,'nativeMetadataSave':True,'batchPublication':True,'apiUnchanged':True,'sknMigrationExecuted':False}
