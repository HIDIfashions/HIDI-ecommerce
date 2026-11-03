"""Render the published image banner before JavaScript from the exact current immutable runtime."""
import importlib.util,json,os,subprocess,sys,re
from pathlib import Path
HERE=Path(__file__).resolve().parent
sys.path.insert(0,str(HERE.parent/'coupon-copy'))
def load(name,path):
    spec=importlib.util.spec_from_file_location(name,path);module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module);return module
x=load('type_release_base',HERE.parent/'coupon-copy/release.py')
patch=load('launch_strip_patch',HERE/'patch-runtime.py')
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
    source=P/'original-image';x.copy('docker://'+before['hidi-web']['image'],'dir:'+str(source),'--preserve-digests')
    assert x.digest((source/'manifest.json').read_bytes())==before['hidi-web']['image'].split('@')[1]
    web=x.unpack('dir:'+str(source),P/'web-base');overlay=P/'overlay'
    plan=patch.patch_runtime(web,overlay);names=set(plan['allowedFiles'])
    fixed={'paint-performance/hero.mjs','paint-performance/image-hero.mjs','dist/index.html'}
    extra=names-fixed
    assert fixed<=names and len(extra)==1 and re.fullmatch(r'dist/assets/index-[a-f0-9]{16}\.js',next(iter(extra)))
    r.save('first-render-patch.json',plan)
    files={'app/'+name:(overlay/name).read_bytes() for name in names};layer.ALLOWED=set(files)
    image_digest=layer.build(source,P/'candidate-image',files);candidate=x.unpack('dir:'+str(P/'candidate-image'),P/'web-candidate')
    old,new=r.images.fingerprints(web),r.images.fingerprints(candidate)
    changed=sorted(k for k in old.keys()|new.keys() if old.get(k)!=new.get(k));assert set(changed)==names
    for name in names:assert (candidate/name).read_bytes()==(overlay/name).read_bytes()
    r.save('web-preservation.json',{'passed':True,'changedFiles':changed,'runtimeConfigPreserved':True,'baseLayersPreserved':True,'imageDigest':image_digest,'pricingPaymentOffersUnchanged':True,'heroMediaUnchanged':True,'fontsUnchanged':True})
    r.save('api-preservation.json',{'passed':True,'unchanged':True,'image':before['hidi-api']['image']})
    with open(os.environ['GITHUB_ENV'],'a') as out:out.write('HIDI_CANDIDATE_RUNTIME='+str(candidate)+'\nHIDI_FIRST_RENDER_SNAPSHOT='+str(P/'public-before.json')+'\n')
    p.unchanged(before)
def seal():
    r.fresh_source();p.unchanged(p.states());assert snapshot()==x.captured()
    report=json.loads(Path('evidence/home-first-render/candidate/report.json').read_text())
    assert report['passed'] and report['actualRuntime'] and report['productionWrites']==0
    assert {(v['engine'],v['width']) for v in report['results']}=={(engine,width) for engine in ['chromium','firefox','webkit'] for width in [390,1440]}
    r.save('first-render-regression.json',report)
    names=['web-preservation.json','api-preservation.json','first-render-patch.json','first-render-regression.json']
    assert all(r.read(name)['passed'] for name in names)
    r.save('sealed.json',{'passed':True,'sourceSha':os.environ['GITHUB_SHA'],'imageDigest':x.digest(x.candidate_manifest()),'reports':{name:x.digest((E/name).read_bytes()) for name in names}})

def publish():
    seal();tag=r.images.REGISTRY+'/hidi-web:home-first-render-'+g.run_key()
    x.copy('dir:'+str(P/'candidate-image'),'docker://'+tag,'--preserve-digests')
    raw=subprocess.check_output(['skopeo','inspect','--raw','--authfile',x.auth(),'docker://'+tag]);assert x.digest(raw)==r.read('sealed.json')['imageDigest']
    image=r.images.REGISTRY+'/hidi-web@'+x.digest(raw);r.save('published.json',{'passed':True,'image':image})
    with open(os.environ['GITHUB_ENV'],'a') as out:out.write('WEB_IMAGE='+image+'\n')
def recover():
    if not (P/'first-render-forward.json').exists():return
    current=json.loads(c.get('/api/hidi/typography'))
    if current.get('stale') is not False or current!=x.captured()['typography']:
        r.save('first-render-recovery.json',{'passed':False,'independentTypographyChangePreserved':True});raise RuntimeError('Typography changed independently; do not restore an older incompatible image')
    image=r.read('published.json')['image'];marker=g.private_json('first-render-forward.json')
    result=g.reconcile_failure(image,p.states(),x.captured(),x.captured(),'firstrender'+g.run_key('a'),bool(marker.get('mayComplete')))
    r.save('first-render-recovery.json',result);assert result['passed']
def apply():
    r.fresh_source();r.backups();before=p.states();p.unchanged(before);assert snapshot()==x.captured()
    sealed=r.read('sealed.json');assert sealed['sourceSha']==os.environ['GITHUB_SHA']
    for name,digest in sealed['reports'].items():assert x.digest((E/name).read_bytes())==digest
    image=r.read('published.json')['image'];assert image.endswith('@'+sealed['imageDigest']);suffix='firstrender'+g.run_key('a');g.install_interrupt_handler()
    try:
        g.conditional_write_image(p.originals()['hidi-web'],image,suffix,'first-render-forward.json')
        web=c.snapshot(g.wait_ready(image,suffix,before))
        for path in ['/health','/healthz','/api/store/health/ready','/','/checkout','/cart']:c.get(path)
        for path in ['/api/hidi/typography/admin','/api/hidi/offers/admin','/admin/offers','/api/hidi/hero-library']:c.get(path,401)
        html=c.get('/admin/typography');assert b'value="retail"' in html and b'id="ht-size-grid"' in html
        assert b'heroChooseImage' in c.get('/admin/landing-media')
        home=c.get('/');assert b'data-hidi-first-image="true"' in home and home.index(b'data-hidi-first-image="true"')<home.index(b'data-hidi-home-discovery')
        subprocess.run(['node',str(HERE/'probe.mjs'),'--live'],check=True,timeout=600)
        assert snapshot()==x.captured(),'Unrelated public configuration or typography changed'
        p.unchanged({'hidi-web':web,'hidi-api':before['hidi-api']})
        r.save('after.json',{'passed':True,'image':image,'sourceSha':os.environ['GITHUB_SHA'],'liveBrowserVerified':True,'cataloguePricesUnchanged':True,'apiUnchanged':True,'pricingPaymentOffersUnchanged':True,'heroMediaUnchanged':True,'typographySettingsUnchanged':True,'publishedTypographyCssUnchanged':True,'welcome250Active':True,'get1Active':True,'settingsWritten':False,'imageHeroInInitialHtml':True})
    except BaseException:recover();raise
if __name__=='__main__':globals()[sys.argv[1]]()
