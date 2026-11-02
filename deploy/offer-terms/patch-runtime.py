"""Add public offer disclosures without editing pricing, checkout logic or stored settings."""
from pathlib import Path
HERE=Path(__file__).resolve().parent
def once(text,old,new):
    assert text.count(old)==1,old
    return text.replace(old,new)
def patch_runtime(base,overlay):
    base,overlay=Path(base),Path(overlay);out=overlay/'offers';out.mkdir(parents=True,exist_ok=True)
    handler=(base/'offers/handler.mjs').read_text(encoding='utf-8')
    handler=once(handler,'landingOffers,hasSelected,changeCampaign','landingOffers,hasSelected,changeCampaign,offerDetails')
    handler=once(handler,"const POLICY='/api/hidi/offers/checkout-policy';","const POLICY='/api/hidi/offers/checkout-policy';\nconst DETAILS='/api/hidi/offers/details';")
    handler=once(handler,"[API,POLICY,'/api/hidi/offers','/admin/offers']","[API,POLICY,DETAILS,'/api/hidi/offers','/admin/offers']")
    handler=once(handler,"path==='/api/hidi/offers'||path===POLICY","path==='/api/hidi/offers'||path===POLICY||path===DETAILS")
    handler=once(handler,'path===POLICY?checkoutPolicy(loaded.value,identity,now()):landingOffers(loaded.value,identity,now())',"path===DETAILS?offerDetails(loaded.value,identity,now(),new URL(req.url,origin).searchParams.get('placement')||'landing'):path===POLICY?checkoutPolicy(loaded.value,identity,now()):landingOffers(loaded.value,identity,now())")
    files={'handler.mjs':handler,'campaigns.mjs':(base/'offers/campaigns.mjs').read_text(encoding='utf-8')+'\n'+(HERE/'details.mjs').read_text(encoding='utf-8'),'storefront.js':(HERE/'client.js').read_text(encoding='utf-8'),'checkout.js':(base/'offers/checkout.js').read_text(encoding='utf-8')+'\n'+(HERE/'client.js').read_text(encoding='utf-8'),'offers.css':(base/'offers/offers.css').read_text(encoding='utf-8')+'\n'+(HERE/'style.css').read_text(encoding='utf-8')}
    for name,text in files.items():(out/name).write_text(text,encoding='utf-8',newline='\n')
    assert files['checkout.js'].startswith((base/'offers/checkout.js').read_text(encoding='utf-8'))
    return {'passed':True,'allowedFiles':['offers/'+n for n in files],'checkoutLogicUnchanged':True,'settingsWritten':False}
