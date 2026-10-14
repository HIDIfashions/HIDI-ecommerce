from pathlib import Path
import shutil,re
HERE=Path(__file__).resolve().parent

def once(source,old,new):
 if source.count(old)==1:return source.replace(old,new,1)
 pattern=re.escape(re.sub(r'\s+', '__WS__', old)).replace('__WS__', r'\s+')
 matches=list(re.finditer(pattern,source));assert len(matches)==1,'One exact checkout hook required: '+old[:100]
 m=matches[0];return source[:m.start()]+new+source[m.end():]
def service(source):
 assert 'hidiPromotion' not in source,'Already installed'
 source="import { loadChoice, normalizedChoice, assertRetry, applyChoice, reservationItems } from './offers-engine.mjs';\n"+source
 source=once(source,'this.validate(input);','this.validate(input);\n        normalizedChoice(input.offer);')
 source=once(source,'if (existing) {','if (existing) {\n            assertRetry(existing, input);')
 source=once(source,'const orderNumber = this.makeOrderNumber();','const hidiPromotion = await loadChoice(input.offer, auth);\n        const orderNumber = this.makeOrderNumber();')
 source=once(source,'const { shippingPaise, totalPaise } = shippingQuote(subtotalPaise);','''const hidiPricing = await applyChoice(tx, cart, subtotalPaise, hidiPromotion);
            const { shippingPaise, totalPaise, discountPaise } = hidiPricing;
            subtotalPaise = hidiPricing.subtotalPaise;''')
 source=once(source,'                subtotalPaise,\n                shippingPaise,','                subtotalPaise,\n                discountPaise,\n                notes: hidiPricing.snapshot ? JSON.stringify({ hidiOffer: hidiPricing.snapshot }) : null,\n                shippingPaise,')
 source=once(source,'unitPricePaise: item.variant.pricePaise,\n                        totalPaise: item.variant.pricePaise * item.quantity,','unitPricePaise: item.variant.pricePaise,\n                        discountPaise: item.hidiDiscountPaise || 0,\n                        totalPaise: item.variant.pricePaise * item.quantity - (item.hidiDiscountPaise || 0),')
 # Reserve each variant once even when regular and ₹1 lines use the same size.
 marker='for (const item of cart.items) {\n                const locked = await tx.$queryRaw'
 source=once(source,marker,'for (const item of reservationItems(cart.items)) {\n                const locked = await tx.$queryRaw')
 source=once(source,'subtotalPaise: order.subtotalPaise,\n            shippingPaise:', 'subtotalPaise: order.subtotalPaise,\n            discountPaise: order.discountPaise || 0,\n            shippingPaise:')
 return source

def patch_runtime(base,overlay,app='web'):
 base,overlay=Path(base),Path(overlay);overlay.mkdir(parents=True)
 allowed=[]
 def put(name,content):
  p=overlay/name;p.parent.mkdir(parents=True,exist_ok=True);p.write_text(content);allowed.append(name)
 if app=='api':
  folder='apps/api/dist/checkout/'
  put(folder+'checkout.service.js',service((base/folder/'checkout.service.js').read_text()))
  controller=(base/folder/'checkout.controller.js').read_text();assert 'attachCheckoutOffers' not in controller
  put(folder+'checkout.controller.js',"import { attachCheckoutOffers } from './checkout-offers-controller.mjs';\n"+controller+'\nattachCheckoutOffers(CheckoutController);\n')
  for src,dst in [('engine.mjs','offers-engine.mjs'),('controller.mjs','checkout-offers-controller.mjs'),('offers-storage.mjs','offers-storage.mjs'),('offers-model.mjs','offers-model.mjs')]:put(folder+dst,(HERE/src).read_text())
 else:
  source=(base/'server.mjs').read_text()
  put('server.mjs',once(source,'function injectStorefrontLayerFix(html) {','''function injectStorefrontLayerFix(html) {
  if (!html.includes('data-hidi-checkout-offers')) html = html.replace(/<\\/head>/i, '<link rel="stylesheet" href="/offers-assets/offers.css"><script data-hidi-checkout-offers src="/offers-assets/checkout.js"></script></head>');'''))
  for name in ['model.mjs','handler.mjs','editor.html','editor.js','offers.css']:put('offers/'+name,(HERE.parent/'offers'/name).read_text())
  put('offers/checkout.js',(HERE/'checkout.js').read_text())
 return {'passed':True,'allowedFiles':sorted(allowed),'databaseMigration':False,'paymentVerificationUnchanged':True}
