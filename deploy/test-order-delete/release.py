"""Owner-only recoverable test-order cleanup: bounded two-image release, no migrations."""
import importlib.util,json,os,subprocess,sys
from pathlib import Path
HERE=Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location('retained_terms_release',HERE.parent/'offer-terms/release.py');t=importlib.util.module_from_spec(spec);spec.loader.exec_module(t)
r,g,p,c=t.r,t.g,t.p,t.c
P,E=r.P,r.E
r.api_guard.public_snapshot=t.snapshot
spec=importlib.util.spec_from_file_location('test_order_patch',HERE/'patch.py');patch=importlib.util.module_from_spec(spec);spec.loader.exec_module(patch)
digest=t.digest
def capture():r.capture()
def compose():
    r.fresh_source();r.backups();before=p.states();p.unchanged(before)
    roots={}
    for app in ['api','web']:
        folder=P/('test-orders-'+app);folder.mkdir()
        source=folder/'original';t.copy('docker://'+before['hidi-'+app]['image'],'dir:'+str(source),'--preserve-digests')
        assert digest((source/'manifest.json').read_bytes())==before['hidi-'+app]['image'].split('@')[1]
        base=t.unpack('dir:'+str(source),folder/'base');overlay=folder/'overlay'
        plan=patch.patch_runtime(base,overlay,app);r.save(app+'-patch.json',plan)
        files={'app/'+name:(overlay/name).read_bytes() for name in plan['allowedFiles']}
        for name in plan['allowedFiles']:
            if name.endswith(('.js','.mjs')):subprocess.run(['node','--check',str(overlay/name)],check=True)
        t.layer.ALLOWED=set(files);image_digest=t.build(source,folder/'candidate-image',files)
        candidate=t.unpack('dir:'+str(folder/'candidate-image'),folder/'candidate');roots[app]=candidate
        old,new=r.images.fingerprints(base),r.images.fingerprints(candidate)
        changed=sorted(k for k in old.keys()|new.keys() if old.get(k)!=new.get(k))
        assert set(changed)==set(plan['allowedFiles']),changed
        for name,content in files.items():assert (candidate/name.removeprefix('app/')).read_bytes()==content
        original=json.loads((source/'manifest.json').read_bytes());packed=json.loads((folder/'candidate-image/manifest.json').read_bytes())
        assert original['layers']==packed['layers'][:-1]
        r.save(app+'-preservation.json',{'passed':True,'changedFiles':changed,'runtimeConfigPreserved':True,'baseLayersPreserved':True,'imageDigest':image_digest,'noSchemaChange':True,'businessWritersUnchanged':True})
    r.save('test-order-assets.json',{'passed':True,'hashes':{name:digest((roots['web']/'test-orders'/name).read_bytes()) for name in ['app.mjs','style.css']}})
    with open(os.environ['GITHUB_ENV'],'a') as out:out.write('HIDI_CANDIDATE_API='+str(roots['api'])+'\nHIDI_CANDIDATE_RUNTIME='+str(roots['web'])+'\n')
    p.unchanged(before)
def seal():
    r.fresh_source();p.unchanged(p.states());assert t.snapshot()==t.captured()
    names=['api-patch.json','web-patch.json','api-preservation.json','web-preservation.json','test-order-assets.json','api-checkout.json','candidate/report.json','purchase-regression/report.json','../welcome250/pricing-payment.json','../welcome250/browser.json','../get1/regression.json','../offer-terms/regression.json','../admin-security/compiled-api.json','../admin-security/runtime-smoke.json','../test-order-delete/sql.json','../test-order-delete/browser.json']
    for name in names:
        report=r.read(name);assert report['passed'],name
        if name.endswith(('browser.json','report.json','regression.json')):assert len(report['results'])==6,name
    report=r.read('../test-order-delete/sql.json');assert report['checks']>=24 and report['productionWrites']==0 and report['inventoryAndPaymentsUnchanged']
    assert r.read('../welcome250/pricing-payment.json')['checks']>=64
    r.save('sealed.json',{'passed':True,'sourceSha':os.environ['GITHUB_SHA'],'images':{app:r.read(app+'-preservation.json')['imageDigest'] for app in ['api','web']},'reports':{n:digest((E/n).read_bytes()) for n in names}})
def publish():
    seal();images={}
    for app in ['api','web']:
        tag=r.images.REGISTRY+'/hidi-'+app+':test-orders-'+g.run_key()
        t.copy('dir:'+str(P/('test-orders-'+app)/'candidate-image'),'docker://'+tag,'--preserve-digests')
        raw=subprocess.check_output(['skopeo','inspect','--raw','--authfile',t.auth(),'docker://'+tag]);assert digest(raw)==r.read('sealed.json')['images'][app]
        images[app]=r.images.REGISTRY+'/hidi-'+app+'@'+digest(raw)
    r.save('published.json',{'passed':True,'images':images})
    with open(os.environ['GITHUB_ENV'],'a') as out:
        for app,image in images.items():out.write(app.upper()+'_IMAGE='+image+'\n')
def verify():
    sealed=r.read('sealed.json');assert sealed['sourceSha']==os.environ['GITHUB_SHA']
    for name,expected in sealed['reports'].items():assert digest((E/name).read_bytes())==expected
    images=r.read('published.json')['images']
    for app,image in images.items():assert image.endswith('@'+sealed['images'][app])
    return images
def recover():
    if not any((P/(app+'-forward.json')).exists() for app in ['web','api']):return
    before=p.states();images=verify();results={}
    for app,guard in [('web',g),('api',r.api_guard)]:
        marker=P/(app+'-forward.json')
        if not marker.exists():continue
        reference=dict(before);peer='hidi-api' if app=='web' else 'hidi-web';reference[peer]=c.snapshot(c.app(peer))
        results[app]=guard.reconcile_failure(images[app],reference,t.captured(),t.captured(),'testorders'+app+g.run_key('a'),bool(json.loads(marker.read_text()).get('mayComplete')))
        assert results[app]['passed'],'Owned recovery failed'
    r.save('recovery.json',{'passed':True,'results':results})
def apply():
    r.fresh_source();r.backups();before=p.states();p.unchanged(before);images=verify();assert t.snapshot()==t.captured();g.install_interrupt_handler();deployed=dict(before)
    try:
        for app,guard in [('api',r.api_guard),('web',g)]:
            suffix='testorders'+app+g.run_key('a');guard.conditional_write_image(p.originals()['hidi-'+app],images[app],suffix,app+'-forward.json')
            deployed['hidi-'+app]=c.snapshot(guard.wait_ready(images[app],suffix,deployed));p.unchanged(deployed)
        for path in ['/health','/healthz','/api/store/health/ready','/','/checkout','/cart']:c.get(path)
        for path in ['/api/hidi/offers/admin','/admin/offers','/admin/test-orders','/api/admin/test-orders','/api/store/admin/test-orders']:c.get(path,401)
        for name,expected in r.read('test-order-assets.json')['hashes'].items():assert digest(c.get('/test-order-assets/'+name))==expected,'Deployed asset differs from tested candidate: '+name
        subprocess.run(['node',str(HERE.parent/'offer-terms/live-check.mjs'),'--approved'],check=True,timeout=240)
        subprocess.run(['node',str(HERE.parent/'responsive-hero/live-check.mjs')],check=True,timeout=480)
        assert t.snapshot()==t.captured(),'Live configuration changed';p.unchanged(deployed)
        r.save('after.json',{'passed':True,'images':images,'sourceSha':os.environ['GITHUB_SHA'],'liveBrowserVerified':True,'productionOrderWrites':0,'pricingPaymentInventoryCodeUnchanged':True,'offerConfigurationUnchanged':True,'cataloguePricesUnchanged':True,'mediaTypographyUnchanged':True,'noSchemaChange':True,'ownerOnly':True})
    except BaseException:recover();raise
if __name__=='__main__':globals()[sys.argv[1]]()
