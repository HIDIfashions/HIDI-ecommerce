"""Web-only hero media release over the captured immutable production runtime."""
import importlib.util,json,os,re,subprocess,sys
from pathlib import Path
HERE=Path(__file__).resolve().parent
sys.path.insert(0,str(HERE.parent/'coupon-copy'))
def load(name,path):
    spec=importlib.util.spec_from_file_location(name,path);module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module);return module
x=load('hero_release_base',HERE.parent/'coupon-copy/release.py')
patch=load('hero_patch',HERE/'patch-runtime.py')
layer=load('hero_layer',HERE.parent/'coupon-copy/layer.py')
r,g,p,c=x.r,x.g,x.p,x.c
P,E=x.P,x.E
old_snapshot=x.snapshot
def snapshot():
    products=json.loads(c.get('/api/store/products'))
    prices=sorted([[v['id'],v.get('pricePaise'),v.get('mrpPaise')] for product in products for v in product.get('variants',[])])
    return {**old_snapshot(),'checkoutAsset':x.digest(c.get('/offers-assets/checkout.js')),'offerStyle':x.digest(c.get('/offers-assets/offers.css')),'portraitOrder':json.loads(c.get('/api/hidi/portrait-order')),'cataloguePrices':prices}
g.public_snapshot=snapshot;x.snapshot=snapshot
def scope(plan):
    names=set(plan['allowedFiles']);fixed={'dist/index.html','dist/landing-media-control.html'};extra=names-fixed
    assert fixed<=names and len(extra)==1 and re.fullmatch(r'dist/assets/index-[a-f0-9]{16}\.js',next(iter(extra)))
    return names
def capture():
    # Capture current offers as-is, including already-active GET1.
    r.capture()
    policy=x.captured()['/api/hidi/offers/checkout-policy']
    assert policy['available'] and policy['welcomeEnabled'] and policy['dressEnabled']
    assert policy['rules']['welcomeMinimumPaise']==149900 and policy['rules']['welcomeDiscountPaise']==25000
def compose():
    r.fresh_source();r.backups();before=p.states();p.unchanged(before)
    api=x.unpack('docker://'+before['hidi-api']['image'],P/'api')
    source=P/'original-image';x.copy('docker://'+before['hidi-web']['image'],'dir:'+str(source),'--preserve-digests')
    assert x.digest((source/'manifest.json').read_bytes())==before['hidi-web']['image'].split('@')[1]
    web=x.unpack('dir:'+str(source),P/'web-base');overlay=P/'overlay'
    plan=patch.patch_runtime(web,overlay);names=scope(plan);r.save('hero-patch.json',plan)
    files={'app/'+name:(overlay/name).read_bytes() for name in names}
    layer.ALLOWED=set(files);image_digest=layer.build(source,P/'candidate-image',files)
    candidate=x.unpack('dir:'+str(P/'candidate-image'),P/'web-candidate')
    old,new=r.images.fingerprints(web),r.images.fingerprints(candidate)
    changed=sorted(k for k in old.keys()|new.keys() if old.get(k)!=new.get(k));assert set(changed)==names
    for name in names:assert (candidate/name).read_bytes()==(overlay/name).read_bytes()
    r.save('web-preservation.json',{'passed':True,'changedFiles':changed,'runtimeConfigPreserved':True,'baseLayersPreserved':True,'imageDigest':image_digest,'pricingPaymentOffersUnchanged':True,'mediaHandlerUnchanged':True})
    r.save('api-preservation.json',{'passed':True,'unchanged':True,'image':before['hidi-api']['image']})
    fixture=P/'hero-fixture';fixture.mkdir();(fixture/'baseline').symlink_to(web,target_is_directory=True);(fixture/'candidate').symlink_to(candidate,target_is_directory=True)
    snap=x.captured();(fixture/'public-before.json').write_text(json.dumps({'/api/hidi/hero-config':snap['hero'],'/api/hidi/landing-media-config':snap['landing']}))
    assets=fixture/'fixtures';assets.mkdir()
    # Synthetic media exist only in the local test fixture, never production.
    subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-f','lavfi','-i','color=c=0x591e22:s=320x480:r=24','-t','3','-c:v','libx264','-pix_fmt','yuv420p','-movflags','+faststart',str(assets/'existing-hero.mp4')],check=True)
    subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-f','lavfi','-i','color=c=0xf4ead8:s=480x720','-frames:v','1','-threads','1',str(assets/'offer.png')],check=True)
    hero=json.loads(json.dumps(snap['hero']));assert hero['items'] and hero['items'][0]['type']=='video','Expected existing video hero'
    hero['items']=[hero['items'][0]];hero['autoPlay']=True;hero['intervalSeconds']=2
    (assets/'hero-config.json').write_text(json.dumps(hero))
    g.write_private('hero-public-assets.json',{'/'+name.removeprefix('dist/'):x.digest((candidate/name).read_bytes()) for name in names if name.startswith('dist/assets/')})
    with open(os.environ['GITHUB_ENV'],'a') as out:
        out.write('HIDI_CANDIDATE_API='+str(api)+'\nHIDI_CANDIDATE_RUNTIME='+str(candidate)+'\nHIDI_HERO_FIXTURE='+str(fixture)+'\n')
    p.unchanged(before)
def seal():
    x.seal()
    report=json.loads((P/'hero-fixture/results/regression.json').read_text())
    assert report['passed'] and report['actualRuntime'] and report['checks']>=232 and len(report['results'])==6 and report['productionWrites']==0
    get1=json.loads(Path('evidence/get1/regression.json').read_text())
    assert get1['passed'] and get1['actualRuntime'] and len(get1['results'])==6 and get1['productionWrites']==0
    r.save('hero-regression.json',report);r.save('get1-regression.json',get1)
    sealed=r.read('sealed.json')
    for name in ['hero-regression.json','hero-patch.json','get1-regression.json']:sealed['reports'][name]=x.digest((E/name).read_bytes())
    r.save('sealed.json',sealed)
def publish():
    seal();tag=r.images.REGISTRY+'/hidi-web:hero-image-loop-'+g.run_key()
    x.copy('dir:'+str(P/'candidate-image'),'docker://'+tag,'--preserve-digests')
    raw=subprocess.check_output(['skopeo','inspect','--raw','--authfile',x.auth(),'docker://'+tag]);assert x.digest(raw)==r.read('sealed.json')['imageDigest']
    image=r.images.REGISTRY+'/hidi-web@'+x.digest(raw);r.save('published.json',{'passed':True,'image':image})
    with open(os.environ['GITHUB_ENV'],'a') as out:out.write('WEB_IMAGE='+image+'\n')
def recover():
    if not (P/'hero-forward.json').exists():return
    image=r.read('published.json')['image'];marker=g.private_json('hero-forward.json')
    result=g.reconcile_failure(image,p.states(),x.captured(),x.captured(),'heroimageloop'+g.run_key('a'),bool(marker.get('mayComplete')))
    r.save('hero-recovery.json',result);assert result['passed']
def apply():
    r.fresh_source();r.backups();before=p.states();p.unchanged(before);assert snapshot()==x.captured()
    sealed=r.read('sealed.json');assert sealed['sourceSha']==os.environ['GITHUB_SHA']
    for name,digest in sealed['reports'].items():assert x.digest((E/name).read_bytes())==digest
    image=r.read('published.json')['image'];assert image.endswith('@'+sealed['imageDigest']);suffix='heroimageloop'+g.run_key('a');g.install_interrupt_handler()
    try:
        g.conditional_write_image(p.originals()['hidi-web'],image,suffix,'hero-forward.json')
        web=c.snapshot(g.wait_ready(image,suffix,before))
        for path in ['/health','/healthz','/api/store/health/ready','/','/checkout','/cart']:c.get(path)
        for path in ['/api/hidi/offers/admin','/admin/offers','/admin/landing-media','/api/hidi/hero-library']:c.get(path,401)
        for path,expected in g.private_json('hero-public-assets.json').items():assert x.digest(c.get(path))==expected,path
        assert b'data-hidi-hero-image-fit' in c.get('/')
        subprocess.run(['node',str(HERE/'live-check.mjs')],check=True)
        assert snapshot()==x.captured(),'Unrelated public configuration changed'
        p.unchanged({'hidi-web':web,'hidi-api':before['hidi-api']})
        r.save('after.json',{'passed':True,'image':image,'sourceSha':os.environ['GITHUB_SHA'],'liveBrowserVerified':True,'cataloguePricesUnchanged':True,'apiUnchanged':True,'pricingPaymentOffersUnchanged':True,'mediaConfigurationUnchanged':True,'welcome250Active':True,'get1Active':True,'settingsWritten':False})
    except BaseException:recover();raise
if __name__=='__main__':globals()[sys.argv[1]]()
