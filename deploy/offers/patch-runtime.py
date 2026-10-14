"""Add the bounded offer handler/UI and a read-only verified identity endpoint."""
from pathlib import Path
import shutil
HERE=Path(__file__).resolve().parent
FILES={'handler.mjs','model.mjs','storage.mjs','editor.html','editor.js','storefront.js','admin-link.js','offers.css'}
API='apps/api/dist/auth/auth.controller.js'
IMPORT='import { createOffersHandler } from "./offers/handler.mjs";'
INIT='''const handleOffers = createOffersHandler({ origin });
const offersLinks = '<link rel="stylesheet" href="/offers-assets/offers.css"><script defer src="/offers-assets/admin-link.js"></script>';
function injectOffers(html, pathname) {
  if (html.includes('data-hidi-offers-loader')) return html;
  const extra = pathname === '/' ? offersLinks + '<script defer data-hidi-offers-loader src="/offers-assets/storefront.js"></script>' : pathname.startsWith('/admin') ? offersLinks : '';
  return extra ? html.replace(/<\\/head>/i, extra + '</head>') : html;
}'''
HOOKS=[
 ('import { createHeroMediaHandler } from "./hero-media.mjs";',IMPORT),
 ('const handleHeroMedia = createHeroMediaHandler({ origin, hasStorefront });',INIT),
 ('  if (await handleHeroMedia(request, response, pathname)) return;','  if (await handleOffers(request, response, pathname)) return;'),
 ('function injectAdminLandingLink(html) {',"  html = injectOffers(html, '/admin');"),
 ('    html = injectSeo(html, request, pathname);','    html = injectOffers(html, pathname);'),
]
def patch_web(source):
    assert 'createOffersHandler' not in source,'Offers already installed; refuse duplicate hooks'
    result=source
    for anchor,addition in HOOKS:
        assert result.count(anchor)==1,'One exact offer hook required: '+anchor
        replacement=addition+'\n'+anchor if anchor.startswith('  if (await handleHeroMedia') else anchor+'\n'+addition
        result=result.replace(anchor,replacement,1)
    restored=result
    for anchor,addition in reversed(HOOKS):
        replacement=addition+'\n'+anchor if anchor.startswith('  if (await handleHeroMedia') else anchor+'\n'+addition
        restored=restored.replace(replacement,anchor,1)
    assert restored==source,'Existing wrapper bytes changed'
    return result
def patch_api(source):
    assert 'offersIdentity' not in source and 'attachOffersIdentity' not in source,'Identity endpoint already installed'
    assert 'class AuthController' in source and 'this.auth' in source,'Exact authentication controller required'
    prefix="import { attachOffersIdentity } from './offers-identity.mjs';\n"
    suffix='\n// HIDI read-only offer identity endpoint\nattachOffersIdentity(AuthController);\n'
    result=prefix+source+suffix
    assert result[len(prefix):-len(suffix)]==source
    return result
def patch_runtime(base,overlay,app='web'):
    base,overlay=Path(base),Path(overlay)
    assert not overlay.exists(),'Fresh overlay required'
    overlay.mkdir(parents=True)
    if app=='api':
        target=overlay/API;target.parent.mkdir(parents=True,exist_ok=True);target.write_text(patch_api((base/API).read_text()))
        helper=target.parent/'offers-identity.mjs';shutil.copyfile(HERE/'identity.mjs',helper)
        allowed=[API,helper.relative_to(overlay).as_posix()]
    else:
        (overlay/'server.mjs').write_text(patch_web((base/'server.mjs').read_text()))
        folder=overlay/'offers';folder.mkdir()
        for name in FILES:shutil.copyfile(HERE/name,folder/name)
        allowed=['server.mjs']+['offers/'+name for name in sorted(FILES)]
    return {'passed':True,'allowedFiles':sorted(allowed),'additiveHooksOnly':True,'checkoutUnchanged':True,'databaseWrites':False,'productMediaWrites':False}
