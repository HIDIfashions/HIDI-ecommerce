"""Patch only approved presentation components in the fresh retained runtime."""
from pathlib import Path
import hashlib
import json
import re
import subprocess
import tempfile

HERE=Path(__file__).resolve().parent
CSS=HERE.parents[1]/'apps/web/app/pdp-recommendations.css'
MARKER='/* hidi-pdp-recommendations-20261023 */'

def patch_runtime(base,overlay):
    base,overlay=Path(base),Path(overlay)
    assert not overlay.exists()
    tree=base/'apps/web/.next'
    original={p.relative_to(base).as_posix():p.read_text() for p in tree.rglob('*')
        if p.is_file() and not p.is_symlink() and p.suffix in {'.js','.json','.html','.rsc','.meta'}}
    index=(base/'dist/index.html').read_text()
    refs=re.findall(r'<script type="module" crossorigin src="([^"\s]+)"></script>',index)
    assert len(refs)==1,'One retained landing module required'
    landing='dist/'+refs[0].removeprefix('./').removeprefix('/')
    original[landing]=(base/landing).read_text()
    with tempfile.TemporaryDirectory() as temp:
        folder=Path(temp);manifest=[]
        for name,text in original.items():
            if name.endswith('.js') and any(s in text for s in ['Indian wear with a calm point','What HIDI customers say','More from the HIDI edit.','How to write a review']):
                target=folder/(str(len(manifest))+'.js')
                manifest.append({'path':name,'source':str(base/name),'target':str(target)})
        (folder/'manifest.json').write_text(json.dumps(manifest))
        subprocess.run(['node',str(HERE/'patch-compiled.mjs'),str(folder/'manifest.json'),str(folder/'report.json')],check=True)
        report=json.loads((folder/'report.json').read_text());semantic=dict(original)
        for item in manifest:
            if Path(item['target']).exists():semantic[item['path']]=Path(item['target']).read_text()
    counts={key:sum(r['counts'][key] for r in report) for key in ['footer','heading','eyebrow','empty','guidance','section','related','order']}
    assert all(counts[key]>0 for key in counts), 'Missing reviewed component edit: '+json.dumps(counts)
    assert any('/server/' in r['path'] and r['counts']['heading'] for r in report)
    assert any('/static/' in r['path'] and r['counts']['footer'] for r in report)
    assert any(r['path']==landing and r['counts']['footer']==1 for r in report)
    # Rehash changed immutable Next chunks and all dependent runtime references.
    mapping={}
    for _ in range(10):
        final={}
        for name,value in semantic.items():
            if name==landing:final[name]=value;continue
            for old,new in mapping.items():
                value=value.replace(re.search(r'-([a-f0-9]{16})\.js$',old)[1],re.search(r'-([a-f0-9]{16})\.js$',new)[1])
            final[name]=value
        updated={}
        for name,value in final.items():
            if name.startswith('apps/web/.next/static/') and name.endswith('.js') and value!=original[name]:
                match=re.search(r'-([a-f0-9]{16})\.js$',name);assert match,'Immutable chunk name required'
                updated[name]=name[:match.start(1)]+hashlib.sha256(value.encode()).hexdigest()[:16]+name[match.end(1):]
        if updated==mapping:break
        mapping=updated
    else:raise AssertionError('Immutable Next references did not settle')
    files={mapping.get(name,name):text for name,text in final.items() if text!=original[name] and name!=landing}
    newlanding='dist/assets/index-'+hashlib.sha256(final[landing].encode()).hexdigest()[:16]+'.js'
    files[newlanding]=final[landing]
    files['dist/index.html']=index.replace(Path(landing).name,Path(newlanding).name)
    mapping[landing]=newlanding
    source=(base/'server.mjs').read_text();assert MARKER not in source
    css=CSS.read_text();assert all(s not in css for s in ['`','${','<','url(','@import'])
    start=source.index('const storefrontLayerFix = `');end=source.index('</style>',start)
    addition='\n'+MARKER+'\n'+css+'\n'
    wrapper=source[:end]+addition+source[end:]
    pattern=r'/\* Trust before diversion: reviews directly after the main PDP grid\. \*/[\s\S]*?grid\.insertAdjacentElement\("afterend", reviews\);\s*\}'
    matches=re.findall(pattern,wrapper);assert len(matches)==1,'Exactly one obsolete review relocation required'
    replacement='/* Recommendations and reviews follow the server-rendered order. */'
    wrapper=wrapper.replace(matches[0],replacement)
    assert wrapper.replace(replacement,matches[0]).replace(addition,'',1)==source
    files['server.mjs']=wrapper
    for name,text in files.items():
        assert name not in mapping.values() or not (base/name).exists(),'Immutable asset exists'
        target=overlay/name;target.parent.mkdir(parents=True,exist_ok=True);target.write_text(text)
    return {'passed':True,'allowedFiles':sorted(files),'compiledEdits':report,'counts':counts,
        'renamedAssets':mapping,'oldAssetsRetained':True,'wrapperInverseVerified':True,
        'cssSha256':hashlib.sha256(css.encode()).hexdigest(),'reviewDataPreserved':True,
        'apiUnchanged':True,'databaseWrites':False,'blobWrites':False}
