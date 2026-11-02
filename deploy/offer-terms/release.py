"""Offer disclosure release; keeps redemption, pricing, payments and media unchanged."""
import importlib.util, json, os, subprocess, sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parent.parent/'coupon-copy'))
import layer
from layer import build, digest

HERE = Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location('coupon_base',HERE.parent/'checkout-offers/release.py')
r=importlib.util.module_from_spec(spec);spec.loader.exec_module(r)
g,p,c=r.guard,r.photo,r.cloud
P,E=r.P,r.E
old_snapshot=g.public_snapshot
def snapshot():
    return {**old_snapshot(), **{path:json.loads(c.get(path)) for path in ['/api/hidi/offers','/api/hidi/offers/checkout-policy','/api/store/checkout/payment-options']}, 'adminEditor':digest(c.get('/offers-assets/editor.js'))}
base_snapshot=snapshot
def snapshot():
    return {**base_snapshot(),'portraitOrder':json.loads(c.get('/api/hidi/portrait-order')),'cataloguePrices':sorted([[v['id'],v.get('pricePaise'),v.get('mrpPaise')] for product in json.loads(c.get('/api/store/products')) for v in product.get('variants',[])]),'typography':json.loads(c.get('/api/hidi/typography')),'typographyCss':digest(c.get('/typography/published.css')),'landingEditor':digest(c.get('/admin/landing-media'))}
g.public_snapshot=snapshot
spec2=importlib.util.spec_from_file_location('terms_patch',HERE/'patch-runtime.py');patch=importlib.util.module_from_spec(spec2);spec2.loader.exec_module(patch)
def run(*args): subprocess.run(args,check=True)
def auth(): return str(Path(os.environ.get('DOCKER_CONFIG',str(Path.home()/'.docker')))/'config.json')
def copy(src,dst,*extra): run('skopeo','copy','--authfile',auth(),*extra,src,dst)
def unpack(src,folder):
    folder.mkdir(parents=True)
    layout=folder/'oci';bundle=folder/'unpacked'
    copy(src,'oci:'+str(layout)+':runtime','--format','oci')
    run('umoci','unpack','--rootless','--image',str(layout)+':runtime',str(bundle))
    return bundle/'rootfs/app'
def candidate_manifest(): return (P/'candidate-image/manifest.json').read_bytes()
def captured(): return g.private_json('public-before.json')
def capture():
    r.capture()
    policy=captured()['/api/hidi/offers/checkout-policy']
    assert policy['available'] and policy['welcomeEnabled'] and policy['dressEnabled']
    assert policy['rules']['welcomeMinimumPaise']==149900 and policy['rules']['welcomeDiscountPaise']==25000
def compose():
    r.fresh_source();r.backups();before=p.states();p.unchanged(before)
    api=unpack('docker://'+before['hidi-api']['image'],P/'api')
    source=P/'original-image';copy('docker://'+before['hidi-web']['image'],'dir:'+str(source),'--preserve-digests')
    assert digest((source/'manifest.json').read_bytes())==before['hidi-web']['image'].split('@')[1]
    web=unpack('dir:'+str(source),P/'web-base')
    overlay=P/'overlay';plan=patch.patch_runtime(web,overlay);r.save('terms-patch.json',plan)
    files={'app/'+name:(overlay/name).read_bytes() for name in plan['allowedFiles']}
    layer.ALLOWED=set(files)
    image_digest=build(source,P/'candidate-image',files)
    candidate=unpack('dir:'+str(P/'candidate-image'),P/'web-candidate')
    old,new=r.images.fingerprints(web),r.images.fingerprints(candidate)
    changed=sorted(k for k in old.keys()|new.keys() if old.get(k)!=new.get(k))
    assert set(changed)==set(plan['allowedFiles']),changed
    for name,content in files.items():assert (candidate/name.removeprefix('app/')).read_bytes()==content
    original=json.loads((source/'manifest.json').read_bytes());packed=json.loads(candidate_manifest())
    assert original['layers']==packed['layers'][:-1]
    r.save('web-preservation.json',{'passed':True,'changedFiles':changed,'runtimeConfigPreserved':True,'baseLayersPreserved':True,'imageDigest':image_digest,'apiUnchanged':True})
    r.save('api-preservation.json',{'passed':True,'unchanged':True,'image':before['hidi-api']['image']})
    g.write_private('asset-hashes.json',{name.removeprefix('app/offers/'):digest(data) for name,data in files.items() if name.split('/')[-1] in ['storefront.js','checkout.js','offers.css']})
    with open(os.environ['GITHUB_ENV'],'a') as out:
        out.write('HIDI_CANDIDATE_API='+str(api)+'\nHIDI_CANDIDATE_RUNTIME='+str(candidate)+'\n')
    p.unchanged(before)
def seal():
    r.fresh_source();p.unchanged(p.states());assert snapshot()==captured()
    names=['web-preservation.json','api-preservation.json','api-checkout.json','candidate/report.json','purchase-regression/report.json']
    reports={name:r.read(name) for name in names}
    assert all(x['passed'] for x in reports.values())
    assert len(reports['candidate/report.json']['results'])==6 and len(reports['purchase-regression/report.json']['results'])==6
    for name in ['pricing-payment.json','browser.json']:
        report=json.loads((Path('evidence/welcome250')/name).read_text());assert report['passed']
        if name=='browser.json':assert len(report['results'])==6
        else:assert report['checks']>=64
    names+=['../welcome250/pricing-payment.json','../welcome250/browser.json']
    for name in ['../get1/regression.json','../offer-terms/regression.json']:
        report=r.read(name);assert report['passed'] and report['actualRuntime'] and report['productionWrites']==0 and len(report['results'])==6;names.append(name)
    names.append('terms-patch.json')
    r.save('sealed.json',{'passed':True,'sourceSha':os.environ['GITHUB_SHA'],'imageDigest':digest(candidate_manifest()),'reports':{n:digest((E/n).read_bytes()) for n in names}})
def publish():
    seal();tag=r.images.REGISTRY+'/hidi-web:offer-terms-'+g.run_key()
    copy('dir:'+str(P/'candidate-image'),'docker://'+tag,'--preserve-digests')
    raw=subprocess.check_output(['skopeo','inspect','--raw','--authfile',auth(),'docker://'+tag])
    assert digest(raw)==r.read('sealed.json')['imageDigest']
    image=r.images.REGISTRY+'/hidi-web@'+digest(raw)
    r.save('published.json',{'passed':True,'image':image})
    with open(os.environ['GITHUB_ENV'],'a') as out:out.write('WEB_IMAGE='+image+'\n')
def verify_assets():
    for name,expected in g.private_json('asset-hashes.json').items():assert digest(c.get('/offers-assets/'+name))==expected,name
def recover():
    if not (P/'offer-terms-forward.json').exists():return
    image=r.read('published.json')['image'];marker=g.private_json('offer-terms-forward.json')
    result=g.reconcile_failure(image,p.states(),captured(),captured(),'offerterms'+g.run_key('a'),bool(marker.get('mayComplete')))
    r.save('offer-terms-recovery.json',result);assert result['passed']
def apply():
    r.fresh_source();r.backups();p.unchanged(p.states());assert snapshot()==captured()
    sealed=r.read('sealed.json');assert sealed['sourceSha']==os.environ['GITHUB_SHA']
    for name,expected in sealed['reports'].items():assert digest((E/name).read_bytes())==expected
    image=r.read('published.json')['image'];assert image.endswith('@'+sealed['imageDigest'])
    before=p.states();suffix='offerterms'+g.run_key('a');g.install_interrupt_handler()
    try:
        g.conditional_write_image(p.originals()['hidi-web'],image,suffix,'offer-terms-forward.json')
        web=c.snapshot(g.wait_ready(image,suffix,before))
        for path in ['/health','/healthz','/api/store/health/ready','/','/checkout','/cart']:c.get(path)
        for path in ['/api/hidi/offers/admin','/admin/offers']:c.get(path,401)
        verify_assets()
        subprocess.run(['node',str(HERE/'live-check.mjs')],check=True,timeout=240)
        subprocess.run(['node',str(HERE.parent/'responsive-hero/live-check.mjs')],check=True,timeout=480)
        assert snapshot()==captured(),'Active offers or payment configuration changed'
        p.unchanged({'hidi-web':web,'hidi-api':before['hidi-api']})
        r.save('after.json',{'passed':True,'welcome250Active':True,'get1Active':True,'apiUnchanged':True,'pricingAndPaymentCodeUnchanged':True,'offerConfigurationUnchanged':True,'cataloguePricesUnchanged':True,'mediaUnchanged':True,'returnPaymentEngineUnchanged':True,'liveBrowserVerified':True,'image':image,'sourceSha':os.environ['GITHUB_SHA']})
    except BaseException:
        recover();raise
if __name__=='__main__':globals()[sys.argv[1]]()
