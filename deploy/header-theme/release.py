"""Guarded web-only burgundy header release over the exact current immutable runtime."""
import importlib.util,json,os,re,subprocess,sys
from pathlib import Path
HERE=Path(__file__).resolve().parent
sys.path.insert(0,str(HERE.parent/'coupon-copy'))
def load(name,path):
    spec=importlib.util.spec_from_file_location(name,path);module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module);return module
x=load('header_release_base',HERE.parent/'coupon-copy/release.py')
patch=load('header_patch',HERE/'patch-runtime.py')
layer=load('header_layer',HERE.parent/'coupon-copy/layer.py')
r,g,p,c=x.r,x.g,x.p,x.c
P,E=x.P,x.E
base_snapshot=x.snapshot
def snapshot():
    products=json.loads(c.get('/api/store/products'))
    prices=sorted([[v['id'],v.get('pricePaise'),v.get('mrpPaise')] for product in products for v in product.get('variants',[])])
    return {**base_snapshot(),'checkoutAsset':x.digest(c.get('/offers-assets/checkout.js')),'offerStyle':x.digest(c.get('/offers-assets/offers.css')),'portraitOrder':json.loads(c.get('/api/hidi/portrait-order')),'cataloguePrices':prices}
g.public_snapshot=snapshot;x.snapshot=snapshot
FIXED={'server.mjs','dist/index.html','seo-document/discovery.mjs'}

def scope(plan):
    names=set(plan['allowedFiles']);extra=names-FIXED
    assert FIXED<=names and len(extra)==1 and re.fullmatch(r'dist/header-burgundy-[a-f0-9]{16}\.css',next(iter(extra)))
    return names

def capture():x.capture()
def compose():
    r.fresh_source();r.backups();before=p.states();p.unchanged(before)
    api=x.unpack('docker://'+before['hidi-api']['image'],P/'api')
    source=P/'original-image';x.copy('docker://'+before['hidi-web']['image'],'dir:'+str(source),'--preserve-digests')
    assert x.digest((source/'manifest.json').read_bytes())==before['hidi-web']['image'].split('@')[1]
    web=x.unpack('dir:'+str(source),P/'web-base');overlay=P/'overlay'
    plan=patch.patch_runtime(web,overlay);names=scope(plan);r.save('header-patch.json',plan)
    files={'app/'+name:(overlay/name).read_bytes() for name in names}
    layer.ALLOWED=set(files);image_digest=layer.build(source,P/'candidate-image',files)
    candidate=x.unpack('dir:'+str(P/'candidate-image'),P/'web-candidate')
    old,new=r.images.fingerprints(web),r.images.fingerprints(candidate)
    changed=sorted(k for k in old.keys()|new.keys() if old.get(k)!=new.get(k));assert set(changed)==names
    for name in names:assert (candidate/name).read_bytes()==(overlay/name).read_bytes()
    r.save('web-preservation.json',{'passed':True,'changedFiles':changed,'runtimeConfigPreserved':True,'baseLayersPreserved':True,'imageDigest':image_digest,'pricingPaymentOffersUnchanged':True})
    r.save('api-preservation.json',{'passed':True,'unchanged':True,'image':before['hidi-api']['image']})
    asset=next(name for name in names if name.endswith('.css'))
    g.write_private('header-public-assets.json',{'/'+asset.removeprefix('dist/'):x.digest((candidate/asset).read_bytes())})
    with open(os.environ['GITHUB_ENV'],'a') as out:out.write('HIDI_CANDIDATE_API='+str(api)+'\nHIDI_CANDIDATE_RUNTIME='+str(candidate)+'\nHIDI_HEADER_PUBLIC='+str(P/'public-before.json')+'\n')
    p.unchanged(before)
def seal():
    x.seal()
    report=json.loads(Path('evidence/header-theme/candidate.json').read_text())
    assert report['passed'] and report['actualRuntime'] and len(report['results'])==96 and report['productionWrites']==0 and not report['errors']
    r.save('header-regression.json',report)
    sealed=r.read('sealed.json')
    for name in ['header-regression.json','header-patch.json']:sealed['reports'][name]=x.digest((E/name).read_bytes())
    r.save('sealed.json',sealed)

def publish():
    seal();tag=r.images.REGISTRY+'/hidi-web:header-burgundy-'+g.run_key()
    x.copy('dir:'+str(P/'candidate-image'),'docker://'+tag,'--preserve-digests')
    raw=subprocess.check_output(['skopeo','inspect','--raw','--authfile',x.auth(),'docker://'+tag]);assert x.digest(raw)==r.read('sealed.json')['imageDigest']
    image=r.images.REGISTRY+'/hidi-web@'+x.digest(raw);r.save('published.json',{'passed':True,'image':image})
    with open(os.environ['GITHUB_ENV'],'a') as out:out.write('WEB_IMAGE='+image+'\n')
def recover():
    if not (P/'header-forward.json').exists():return
    image=r.read('published.json')['image'];marker=g.private_json('header-forward.json')
    result=g.reconcile_failure(image,p.states(),x.captured(),x.captured(),'burgundyheader'+g.run_key('a'),bool(marker.get('mayComplete')))
    r.save('header-recovery.json',result);assert result['passed']
def apply():
    r.fresh_source();r.backups();before=p.states();p.unchanged(before);assert snapshot()==x.captured()
    sealed=r.read('sealed.json');assert sealed['sourceSha']==os.environ['GITHUB_SHA']
    for name,digest in sealed['reports'].items():assert x.digest((E/name).read_bytes())==digest
    image=r.read('published.json')['image'];assert image.endswith('@'+sealed['imageDigest']);suffix='burgundyheader'+g.run_key('a');g.install_interrupt_handler()
    try:
        g.conditional_write_image(p.originals()['hidi-web'],image,suffix,'header-forward.json')
        web=c.snapshot(g.wait_ready(image,suffix,before))
        for path in ['/health','/healthz','/api/store/health/ready','/','/checkout','/cart']:c.get(path)
        for path in ['/api/hidi/offers/admin','/admin/offers','/api/hidi/landing-media-portrait-order']:c.get(path,401)
        for path,expected in g.private_json('header-public-assets.json').items():assert x.digest(c.get(path))==expected,path
        for path in ['/','/collections/all','/checkout','/cart','/guides','/guides/kurta-set-buying-guide','/guides/choosing-kurta-set-size']:
            assert b'data-hidi-header-burgundy' in c.get(path),path+' did not receive the header stylesheet'
        subprocess.run(['node',str(HERE/'probe.mjs'),'live'],check=True)
        assert snapshot()==x.captured(),'Unrelated public configuration changed'
        p.unchanged({'hidi-web':web,'hidi-api':before['hidi-api']})
        r.save('after.json',{'passed':True,'image':image,'sourceSha':os.environ['GITHUB_SHA'],'headerColor':'#591E22','liveBrowserVerified':True,'cataloguePricesUnchanged':True,'apiUnchanged':True,'pricingPaymentOffersUnchanged':True,'mediaConfigurationUnchanged':True,'welcome250Active':True,'get1Active':False,'settingsWritten':False})
    except BaseException:recover();raise
if __name__=='__main__':globals()[sys.argv[1]]()
