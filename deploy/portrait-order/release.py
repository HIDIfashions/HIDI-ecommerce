"""Guarded web-only portrait-order release over the exact current immutable runtime."""
import importlib.util,json,os,re,subprocess,sys
from pathlib import Path
HERE=Path(__file__).resolve().parent
sys.path.insert(0,str(HERE.parent/'coupon-copy'))
def load(name,path):
    spec=importlib.util.spec_from_file_location(name,path);module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module);return module
x=load('portrait_release_base',HERE.parent/'coupon-copy/release.py')
patch=load('portrait_patch',HERE/'patch-runtime.py')
layer=load('portrait_layer',HERE.parent/'coupon-copy/layer.py')
r,g,p,c=x.r,x.g,x.p,x.c
P,E=x.P,x.E
base_snapshot=x.snapshot
def snapshot():
    return {**base_snapshot(),'checkoutAsset':x.digest(c.get('/offers-assets/checkout.js')),'offerStyle':x.digest(c.get('/offers-assets/offers.css'))}
g.public_snapshot=snapshot;x.snapshot=snapshot
FIXED={'hero-media.mjs','dist/index.html','dist/landing-media-control.html'}|{'portrait-order/'+name for name in ['model.mjs','storage.mjs','handler.mjs','editor.mjs','editor.css']}
def scope(plan):
    names=set(plan['allowedFiles']);extra=names-FIXED
    assert FIXED<=names and len(extra)==1 and re.fullmatch(r'dist/assets/index-[a-f0-9]{16}\.js',next(iter(extra)))
    return names
def capture():x.capture()
def compose():
    r.fresh_source();r.backups();before=p.states();p.unchanged(before)
    api=x.unpack('docker://'+before['hidi-api']['image'],P/'api')
    source=P/'original-image';x.copy('docker://'+before['hidi-web']['image'],'dir:'+str(source),'--preserve-digests')
    assert x.digest((source/'manifest.json').read_bytes())==before['hidi-web']['image'].split('@')[1]
    web=x.unpack('dir:'+str(source),P/'web-base');overlay=P/'overlay'
    plan=patch.patch_runtime(web,overlay);names=scope(plan);r.save('portrait-patch.json',plan)
    files={'app/'+name:(overlay/name).read_bytes() for name in names}
    layer.ALLOWED=set(files);image_digest=layer.build(source,P/'candidate-image',files)
    candidate=x.unpack('dir:'+str(P/'candidate-image'),P/'web-candidate')
    old,new=r.images.fingerprints(web),r.images.fingerprints(candidate)
    changed=sorted(k for k in old.keys()|new.keys() if old.get(k)!=new.get(k));assert set(changed)==names
    for name in names:assert (candidate/name).read_bytes()==(overlay/name).read_bytes()
    r.save('web-preservation.json',{'passed':True,'changedFiles':changed,'runtimeConfigPreserved':True,'baseLayersPreserved':True,'imageDigest':image_digest,'pricingPaymentOffersUnchanged':True})
    r.save('api-preservation.json',{'passed':True,'unchanged':True,'image':before['hidi-api']['image']})
    fixture=P/'portrait-fixture';fixture.mkdir();(fixture/'baseline').symlink_to(web,target_is_directory=True);(fixture/'candidate').symlink_to(candidate,target_is_directory=True)
    snap=x.captured();(fixture/'public-before.json').write_text(json.dumps({'/api/hidi/hero-config':snap['hero'],'/api/hidi/landing-media-config':snap['landing'],**{path:snap[path] for path in ['/api/hidi/offers/checkout-policy','/api/store/checkout/payment-options']}}))
    public={('/'+name.removeprefix('dist/')):x.digest((candidate/name).read_bytes()) for name in names if name.startswith('dist/assets/')}
    public.update({'/portrait-order-assets/'+name:x.digest((candidate/'portrait-order'/name).read_bytes()) for name in ['editor.mjs','model.mjs','editor.css']})
    g.write_private('portrait-public-assets.json',public)
    with open(os.environ['GITHUB_ENV'],'a') as out:out.write('HIDI_CANDIDATE_API='+str(api)+'\nHIDI_CANDIDATE_RUNTIME='+str(candidate)+'\nHIDI_PORTRAIT_ACTUAL_RUNTIME='+str(candidate)+'\nHIDI_PORTRAIT_FIXTURE='+str(fixture)+'\n')
    p.unchanged(before)
def seal():
    x.seal()
    report=json.loads((P/'portrait-fixture/results/regression.json').read_text())
    assert report['passed'] and report['actualRuntime'] and report['checks']>=196 and len(report['results'])==6 and report['productionWrites']==0
    r.save('portrait-regression.json',report)
    sealed=r.read('sealed.json');sealed['reports']['portrait-regression.json']=x.digest((E/'portrait-regression.json').read_bytes());sealed['reports']['portrait-patch.json']=x.digest((E/'portrait-patch.json').read_bytes());r.save('sealed.json',sealed)
def publish():
    seal();tag=r.images.REGISTRY+'/hidi-web:portrait-order-'+g.run_key()
    x.copy('dir:'+str(P/'candidate-image'),'docker://'+tag,'--preserve-digests')
    raw=subprocess.check_output(['skopeo','inspect','--raw','--authfile',x.auth(),'docker://'+tag]);assert x.digest(raw)==r.read('sealed.json')['imageDigest']
    image=r.images.REGISTRY+'/hidi-web@'+x.digest(raw);r.save('published.json',{'passed':True,'image':image})
    with open(os.environ['GITHUB_ENV'],'a') as out:out.write('WEB_IMAGE='+image+'\n')
def recover():
    if not (P/'portrait-forward.json').exists():return
    image=r.read('published.json')['image'];marker=g.private_json('portrait-forward.json')
    result=g.reconcile_failure(image,p.states(),x.captured(),x.captured(),'portraitorder'+g.run_key('a'),bool(marker.get('mayComplete')))
    r.save('portrait-recovery.json',result);assert result['passed']
def apply():
    r.fresh_source();r.backups();before=p.states();p.unchanged(before);assert snapshot()==x.captured()
    sealed=r.read('sealed.json');assert sealed['sourceSha']==os.environ['GITHUB_SHA']
    for name,digest in sealed['reports'].items():assert x.digest((E/name).read_bytes())==digest
    image=r.read('published.json')['image'];assert image.endswith('@'+sealed['imageDigest']);suffix='portraitorder'+g.run_key('a');g.install_interrupt_handler()
    try:
        g.conditional_write_image(p.originals()['hidi-web'],image,suffix,'portrait-forward.json')
        web=c.snapshot(g.wait_ready(image,suffix,before))
        for path in ['/health','/healthz','/api/store/health/ready','/','/checkout','/cart']:c.get(path)
        for path in ['/api/hidi/offers/admin','/admin/offers','/api/hidi/landing-media-portrait-order']:c.get(path,401)
        for path,expected in g.private_json('portrait-public-assets.json').items():assert x.digest(c.get(path))==expected,path
        order=json.loads(c.get('/api/hidi/portrait-order'))['order'];assert order==['DSC01671','DSC01431','DSC01567','DSC01529','DSC01849'],'Initial live dress order must remain unchanged'
        assert snapshot()==x.captured(),'Unrelated public configuration changed'
        p.unchanged({'hidi-web':web,'hidi-api':before['hidi-api']})
        r.save('after.json',{'passed':True,'image':image,'sourceSha':os.environ['GITHUB_SHA'],'dressOrder':order,'captionsPaired':True,'apiUnchanged':True,'pricingPaymentOffersUnchanged':True,'mediaConfigurationUnchanged':True,'welcome250Active':True,'get1Active':False,'orderSettingsWritten':False})
    except BaseException:recover();raise
if __name__=='__main__':globals()[sys.argv[1]]()
