from pathlib import Path
HERE=Path(__file__).resolve().parent
def once(source,old,new):
    assert source.count(old)==1,'Recognized live hook required: '+old
    return source.replace(old,new,1)
def patch_runtime(base,overlay,app):
    base,overlay=Path(base),Path(overlay);allowed=[]
    def put(name,content):
        dest=overlay/name;dest.parent.mkdir(parents=True,exist_ok=True);dest.write_text(content,encoding='utf-8');allowed.append(name)
    if app=='api':
        path='apps/api/dist/admin/admin-auth.js';source=(base/path).read_text()
        assert 'resolveVerifiedIdentity' not in source,'Session policy already installed; review before replacing'
        source='import { resolveAdminSession } from "./admin-session.js";\n'+source
        source=once(source,'async resolveActor(input) {','async resolveActor(input) { return resolveAdminSession(this.prisma, input.authorization); }\n    async resolveVerifiedIdentity(input) {')
        put(path,source)
        path='apps/api/dist/admin/admin-security.module.js';source=(base/path).read_text()
        source='import { AdminLoginController } from "./admin-login.controller.js";\n'+source
        source=once(source,'controllers: [AdminEmailAuthController]','controllers: [AdminEmailAuthController, AdminLoginController]');put(path,source)
        path='apps/api/dist/app.module.js';source=(base/path).read_text()
        source='import { AdminSalesModule } from "./admin/admin-sales.module.js";\n'+source
        source=once(source,'imports: [','imports: [AdminSalesModule, ');put(path,source)
        for name in ['admin-session','admin-login.controller','admin-sales.service','admin-sales.controller','admin-sales.module']:
            path='apps/api/dist/admin/'+name+'.js';assert not (base/path).exists();put(path,Path(path).read_text())
    else:
        path='server.mjs';source=(base/path).read_text();assert 'createAdminSecurityHandler' not in source
        source='import { createAdminSecurityHandler } from "./admin-security/handler.mjs";\n'+source
        source=once(source,'const handleOffers = createOffersHandler({ origin });','const handleAdminSecurity = createAdminSecurityHandler();\nconst handleOffers = createOffersHandler({ origin });')
        anchor='  if (await handleOffers(request, response, pathname)) return;'
        source=once(source,anchor,'  if (await handleAdminSecurity(request, response, pathname)) return;\n'+anchor)
        anchor='function injectOffers(html, pathname) {'
        source=once(source,anchor,anchor+'\n  if (pathname?.startsWith("/admin") && !pathname.startsWith("/admin/sign") && !html.includes("data-hidi-session-policy")) html = html.replace(/<\\/head>/i, \'<script type="module" data-hidi-session-policy src="/admin-security-assets/activity.mjs"></script></head>\');')
        # The newer admin workspace returns before the legacy admin navigation
        # injector. Its final HTML still passes through this shared layer hook.
        # Match only actual Next admin documents, preserving all public pages.
        anchor='function injectStorefrontLayerFix(html, pathname) {'
        source=once(source,anchor,anchor+'\n  if (pathname?.startsWith("/admin") && !html.includes("data-hidi-session-policy")) html = html.replace(/<\\/head>/i, \'<script type="module" data-hidi-session-policy src="/admin-security-assets/activity.mjs"></script></head>\');')
        put(path,source)
        for name in ['handler.mjs','activity.mjs','login.html','login.mjs','sales.html','sales.mjs','styles.css']:put('admin-security/'+name,(HERE/name).read_text())
        # Standalone runtime pages bypass injectOffers; install the same activity
        # observer in their retained HTML without changing any other bytes.
        for folder in ['support-staff','admin-tools','pricing','offers','privacy-policy']:
            if not (base/folder).exists():continue
            for file in (base/folder).glob('*.html'):
                text=file.read_text()
                if '/admin' in text and '</head>' in text:
                    put(file.relative_to(base).as_posix(),once(text,'</head>','<script type="module" data-hidi-session-policy src="/admin-security-assets/activity.mjs"></script></head>'))
    return {'passed':True,'allowedFiles':sorted(allowed),'retainedApplicationPreserved':True}

