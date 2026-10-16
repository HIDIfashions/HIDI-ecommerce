"""Add pricing controls without changing catalogue data or retained application files."""
from pathlib import Path
import re
HERE=Path(__file__).resolve().parent

def once(source,anchor,addition):
    assert source.count(anchor)==1,'One pricing hook required: '+anchor
    return source.replace(anchor,anchor+addition,1)

def disable_percent(source):
    message='Additional checkout percentage discounts are disabled. Product prices are as displayed.'
    if message in source:return source
    pattern=r'const value\s*=\s*input\s*\?\?\s*\{\s*kind:\s*[\'\"]NONE[\'\"]\s*\};'
    matches=list(re.finditer(pattern,source));assert len(matches)==1,'Recognized offer normalization required'
    match=matches[0]
    addition="\n if(value?.kind==='PERCENT15')throw new BadRequestException('"+message+"');"
    return source[:match.end()]+addition+source[match.end():]

def patch_runtime(base,overlay,app='web'):
    base,overlay=Path(base),Path(overlay);overlay.mkdir(parents=True)
    allowed=[]
    def put(name,data):
        target=overlay/name;target.parent.mkdir(parents=True,exist_ok=True);target.write_text(data,encoding='utf-8');allowed.append(name)
    if app=='api':
        for name in ['apps/api/dist/checkout/offers-engine.mjs','apps/api/dist/checkout/offers-engine.js']:
            if (base/name).exists():put(name,disable_percent((base/name).read_text(encoding='utf-8')))
        assert allowed,'Existing offer engine required'
    else:
        source=(base/'server.mjs').read_text(encoding='utf-8')
        assert 'createPricingHandler' not in source,'Pricing already installed'
        source=once(source,'import { createOffersHandler } from "./offers/handler.mjs";','\nimport { createPricingHandler } from "./pricing/handler.mjs";')
        source=once(source,'const handleOffers = createOffersHandler({ origin });','\nconst handlePricing = createPricingHandler({ origin });')
        source=once(source,'  if (await handleOffers(request, response, pathname)) return;','\n  if (await handlePricing(request, response, pathname)) return;')
        injection="\n  if (!html.includes('data-hidi-pricing-loader')) html = html.replace(/<\\/head>/i, '<link rel=\"stylesheet\" href=\"/pricing-assets/styles.css\"><script type=\"module\" data-hidi-pricing-loader src=\"/pricing-assets/storefront.mjs\"></script></head>');"
        # injectOffers runs for both the static homepage and retained Next routes.
        source=once(source,'function injectOffers(html, pathname) {',injection)
        put('server.mjs',source)
        for name in ['model.mjs','handler.mjs','admin.html','admin.mjs','storefront.mjs','styles.css']:put('pricing/'+name,(HERE/name).read_text(encoding='utf-8'))
        put('offers/checkout.js',(HERE/'checkout.js').read_text(encoding='utf-8'))
    return {'passed':True,'allowedFiles':sorted(allowed),'databaseWrites':False,'cataloguePricesUnchanged':True,'checkoutPercentDisabled':True}
