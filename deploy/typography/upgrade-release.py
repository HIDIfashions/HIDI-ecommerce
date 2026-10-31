"""Bounded typography settings upgrade using the exact current immutable runtime."""
import importlib.util,json,os,subprocess,sys
from pathlib import Path
HERE=Path(__file__).resolve().parent
sys.path.insert(0,str(HERE.parent/'coupon-copy'))
def load(name,path):
    spec=importlib.util.spec_from_file_location(name,path);module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module);return module
x=load('type_release_base',HERE.parent/'coupon-copy/release.py')
patch=load('type_upgrade_patch',HERE/'upgrade-patch.py')
layer=load('type_upgrade_layer',HERE.parent/'coupon-copy/layer.py')
r,g,p,c=x.r,x.g,x.p,x.c
P,E=x.P,x.E
old_snapshot=x.snapshot
def snapshot():
    products=json.loads(c.get('/api/store/products'))
    typography=json.loads(c.get('/api/hidi/typography'));assert typography['stale'] is False
    return {**old_snapshot(),'typography':typography,'typographyCss':x.digest(c.get('/typography/published.css')),'checkoutAsset':x.digest(c.get('/offers-assets/checkout.js')),'offerStyle':x.digest(c.get('/offers-assets/offers.css')),'portraitOrder':json.loads(c.get('/api/hidi/portrait-order')),'cataloguePrices':sorted([[v['id'],v.get('pricePaise'),v.get('mrpPaise')] for product in products for v in product.get('variants',[])])}
g.public_snapshot=snapshot;x.snapshot=snapshot
def capture():
    r.capture();policy=x.captured()['/api/hidi/offers/checkout-policy']
    assert policy['available'] and policy['welcomeEnabled'] and policy['dressEnabled']
def compose():
    r.fresh_source();r.backups();before=p.states();p.unchanged(before)
    api=x.unpack('docker://'+before['hidi-api']['image'],P/'api')
    source=P/'original-image';x.copy('docker://'+before['hidi-web']['image'],'dir:'+str(source),'--preserve-digests')
    assert x.digest((source/'manifest.json').read_bytes())==before['hidi-web']['image'].split('@')[1]
    web=x.unpack('dir:'+str(source),P/'web-base');overlay=P/'overlay'
    plan=patch.patch_runtime(web,overlay);names=set(plan['allowedFiles']);assert names=={'typography/'+name for name in patch.FILES};r.save('typography-patch.json',plan)
    files={'app/'+name:(overlay/name).read_bytes() for name in names};layer.ALLOWED=set(files)
    image_digest=layer.build(source,P/'candidate-image',files);candidate=x.unpack('dir:'+str(P/'candidate-image'),P/'web-candidate')
    old,new=r.images.fingerprints(web),r.images.fingerprints(candidate)
    changed=sorted(k for k in old.keys()|new.keys() if old.get(k)!=new.get(k));assert set(changed)==names
    for name in names:assert (candidate/name).read_bytes()==(overlay/name).read_bytes()
    r.save('web-preservation.json',{'passed':True,'changedFiles':changed,'runtimeConfigPreserved':True,'baseLayersPreserved':True,'imageDigest':image_digest,'pricingPaymentOffersUnchanged':True,'heroMediaUnchanged':True,'fontsUnchanged':True})
    r.save('api-preservation.json',{'passed':True,'unchanged':True,'image':before['hidi-api']['image']})
    g.write_private('typography-public-assets.json',{'/typography/assets/'+name:x.digest((candidate/'typography'/name).read_bytes()) for name in ['registry.mjs','editor.js','editor.css']})
    with open(os.environ['GITHUB_ENV'],'a') as out:out.write('HIDI_CANDIDATE_API='+str(api)+'\nHIDI_CANDIDATE_RUNTIME='+str(candidate)+'\n')
    p.unchanged(before)
def seal():
    x.seal()
    unit=json.loads(Path('evidence/typography/unit.json').read_text());assert unit['passed']
    report=json.loads(Path('evidence/typography/candidate.json').read_text())
    assert report['passed'] and report['actualRuntime'] and report['serverRendered'] and report['productionWrites']==0
    matrix={(engine,width) for engine in ['chromium','firefox','webkit'] for width in [390,768,1440]}
    assert {(v['engine'],v['width']) for v in report['cases']}==matrix
    assert {(v['engine'],v['width']) for v in report['sizeSettings']}==matrix
    assert len(report['fontLibrary'])==120 and all(v['fontLoaded'] and v['preUpgradeTab'] for v in report['fontLibrary'])
    get1=json.loads(Path('evidence/get1/regression.json').read_text());assert get1['passed'] and get1['actualRuntime'] and len(get1['results'])==6 and get1['productionWrites']==0
    r.save('typography-regression.json',report);r.save('typography-unit.json',unit);r.save('get1-regression.json',get1)
    sealed=r.read('sealed.json')
    for name in ['typography-regression.json','typography-unit.json','typography-patch.json','get1-regression.json']:sealed['reports'][name]=x.digest((E/name).read_bytes())
    r.save('sealed.json',sealed)
def publish():
    seal();tag=r.images.REGISTRY+'/hidi-web:typography-sizes-'+g.run_key()
    x.copy('dir:'+str(P/'candidate-image'),'docker://'+tag,'--preserve-digests')
    raw=subprocess.check_output(['skopeo','inspect','--raw','--authfile',x.auth(),'docker://'+tag]);assert x.digest(raw)==r.read('sealed.json')['imageDigest']
    image=r.images.REGISTRY+'/hidi-web@'+x.digest(raw);r.save('published.json',{'passed':True,'image':image})
    with open(os.environ['GITHUB_ENV'],'a') as out:out.write('WEB_IMAGE='+image+'\n')
def recover():
    if not (P/'typography-forward.json').exists():return
    current=json.loads(c.get('/api/hidi/typography'))
    if current.get('stale') is not False or current!=x.captured()['typography']:
        r.save('typography-recovery.json',{'passed':False,'independentTypographyChangePreserved':True});raise RuntimeError('Typography changed independently; do not restore an older incompatible image')
    image=r.read('published.json')['image'];marker=g.private_json('typography-forward.json')
    result=g.reconcile_failure(image,p.states(),x.captured(),x.captured(),'typesizes'+g.run_key('a'),bool(marker.get('mayComplete')))
    r.save('typography-recovery.json',result);assert result['passed']
def apply():
    r.fresh_source();r.backups();before=p.states();p.unchanged(before);assert snapshot()==x.captured()
    sealed=r.read('sealed.json');assert sealed['sourceSha']==os.environ['GITHUB_SHA']
    for name,digest in sealed['reports'].items():assert x.digest((E/name).read_bytes())==digest
    image=r.read('published.json')['image'];assert image.endswith('@'+sealed['imageDigest']);suffix='typesizes'+g.run_key('a');g.install_interrupt_handler()
    try:
        g.conditional_write_image(p.originals()['hidi-web'],image,suffix,'typography-forward.json')
        web=c.snapshot(g.wait_ready(image,suffix,before))
        for path in ['/health','/healthz','/api/store/health/ready','/','/checkout','/cart']:c.get(path)
        for path in ['/api/hidi/typography/admin','/api/hidi/offers/admin','/admin/offers','/api/hidi/hero-library']:c.get(path,401)
        for path,expected in g.private_json('typography-public-assets.json').items():assert x.digest(c.get(path))==expected,path
        html=c.get('/admin/typography');assert b'value="retail"' in html and b'id="ht-size-grid"' in html
        assert b'heroChooseImage' in c.get('/admin/landing-media')
        subprocess.run(['node',str(HERE/'verify.mjs'),'--live'],check=True,timeout=600)
        assert snapshot()==x.captured(),'Unrelated public configuration or typography changed'
        p.unchanged({'hidi-web':web,'hidi-api':before['hidi-api']})
        r.save('after.json',{'passed':True,'image':image,'sourceSha':os.environ['GITHUB_SHA'],'liveBrowserVerified':True,'cataloguePricesUnchanged':True,'apiUnchanged':True,'pricingPaymentOffersUnchanged':True,'heroMediaUnchanged':True,'typographySettingsUnchanged':True,'publishedTypographyCssUnchanged':True,'welcome250Active':True,'get1Active':True,'settingsWritten':False})
    except BaseException:recover();raise
if __name__=='__main__':globals()[sys.argv[1]]()
