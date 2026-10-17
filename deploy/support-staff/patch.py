from pathlib import Path
HERE=Path(__file__).resolve().parent

def replace_once(source,old,new):
    assert source.count(old)==1,'Recognized live hook required: '+old[:100]
    result=source.replace(old,new,1)
    assert result.replace(new,old,1)==source,'Inverse transform failed'
    return result

def patch_runtime(base,overlay,app):
    base,overlay=Path(base),Path(overlay);allowed=[]
    def put(name,content):
        dest=overlay/name;dest.parent.mkdir(parents=True,exist_ok=True);dest.write_text(content,encoding='utf-8');allowed.append(name)
    if app=='api':
        path='apps/api/dist/app.module.js';source=(base/path).read_text()
        assert 'AdminSupportModule' not in source,'Support module already installed; review update'
        source='import { AdminSupportModule } from "./admin/admin-support.module.js";\n'+source
        source=replace_once(source,'imports: [','imports: [AdminSupportModule, ');put(path,source)
        path='apps/api/dist/admin/admin-auth.js';source=(base/path).read_text()
        assert 'support:write' not in source,'Support permissions already installed; review update'
        for role,perms in [('OWNER','"support:write", "support:approve",'),('OPERATIONS','"support:write",'),('SUPPORT','"support:write",')]:
            old=role+': new Set([';source=replace_once(source,old,old+'\n        '+perms)
        source=replace_once(source,'create_user: false','create_user: true')
        old='if (actor.id === current.id && (!nextActive || nextRole !== current.role)) {'
        lock='if (current.email.trim().toLowerCase() === "fashionshidi@gmail.com" && (!nextActive || nextRole !== "OWNER")) { throw new ConflictException("The primary HIDI Owner cannot be disabled or demoted"); }\n        '
        source=replace_once(source,old,lock+old);put(path,source)
        for name in ['admin-support.service','admin-support.controller','admin-support.module']:
            path='apps/api/dist/admin/'+name+'.js';assert not (base/path).exists(),'Existing support file requires review';put(path,Path(path).read_text())
    else:
        path='server.mjs';source=(base/path).read_text();assert 'createSupportHandler' not in source,'Support runtime already installed; review update'
        anchor='import { createOffersHandler } from "./offers/handler.mjs";'
        source=replace_once(source,anchor,anchor+'\nimport { createSupportHandler } from "./support-staff/handler.mjs";')
        anchor='const handleOffers = createOffersHandler({ origin });'
        source=replace_once(source,anchor,anchor+'\nconst handleSupport = createSupportHandler({ origin });')
        anchor='  if (await handleOffers(request, response, pathname)) return;'
        source=replace_once(source,anchor,anchor+'\n  if (await handleSupport(request, response, pathname)) return;')
        anchor='function injectOffers(html, pathname) {'
        addition='\n  if (pathname?.startsWith("/admin") && !html.includes("data-hidi-support-nav")) html = html.replace(/<\\/head>/i, \'<script type="module" data-hidi-support-nav src="/support-assets/navigation.mjs"></script></head>\');'
        source=replace_once(source,anchor,anchor+addition);put(path,source)
        for name in ['handler.mjs','admin.html','admin.mjs','styles.css','navigation.mjs']:put('support-staff/'+name,(HERE/name).read_text())
    return {'passed':True,'allowedFiles':sorted(allowed),'retainedApplicationPreserved':True}
