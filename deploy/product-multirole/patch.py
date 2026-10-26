"""Overlay only the requested product detail and role boundaries."""
from pathlib import Path
import json,subprocess
HERE=Path(__file__).resolve().parent
def once(source,old,new):
    assert source.count(old)==1,'Recognized live hook required: '+old[:100]
    return source.replace(old,new,1)
def patch_runtime(base,overlay,app):
    base,overlay=Path(base),Path(overlay);allowed=[]
    def put(name,text):
        destination=overlay/name;destination.parent.mkdir(parents=True,exist_ok=True);destination.write_text(text,encoding='utf-8');allowed.append(name)
    if app=='api':
        assert 'resolveVerifiedIdentity' in (base/'apps/api/dist/admin/admin-auth.js').read_text()
        for name in ['admin-auth','admin.controller','admin-session','admin-roles']:
            path='apps/api/dist/admin/'+name+'.js';put(path,Path(path).read_text())
    else:
        # Standalone editor and team assets retain the installed activity observer.
        for folder,names in {
            'admin-tools':['product-page.html','product-page.mjs','product-page.css','product-page-model.mjs','product-detail-fields.mjs','product-copy.mjs'],
            'support-staff':['admin.html','admin.mjs'],
        }.items():
            for name in names:
                path=folder+'/'+name;text=Path('deploy',path).read_text()
                if name.endswith('.html'):
                    assert 'data-hidi-session-policy' in (base/path).read_text()
                    text=once(text,'</head>','<script type="module" data-hidi-session-policy src="/admin-security-assets/activity.mjs"></script></head>')
                put(path,text)
        path='support-staff/styles.css'
        put(path,(base/path).read_text()+'\n'+(HERE/'roles.css').read_text())
        path='admin-tools/handler.mjs';text=(base/path).read_text()
        anchor="'product-page-model.mjs',"
        put(path,once(text,anchor,anchor+"'product-detail-fields.mjs',"))
        path='admin-tools/image-sku-handler.mjs';text=(base/path).read_text()
        old="!['OWNER', 'CATALOG'].includes(identity.admin.role)"
        new="!(identity.admin.roles ?? [identity.admin.role]).some(role => ['OWNER', 'CATALOG'].includes(role))"
        put(path,once(text,old,new))
        for script,report in [('patch-product.mjs','product-patch.json'),('patch-navigation.mjs','navigation-patch.json')]:
            subprocess.run(['node',str(HERE/script),str(base),str(overlay)],check=True)
            allowed+=json.loads(Path('evidence/product-multirole',report).read_text())['allowedFiles']
    assert len(allowed)==len(set(allowed)),'Independent overlays cannot overwrite one another'
    return {'passed':True,'allowedFiles':sorted(allowed),'retainedApplicationPreserved':True}
