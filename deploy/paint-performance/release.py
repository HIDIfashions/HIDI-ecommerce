import importlib.util,json,os,re,signal,subprocess,time,urllib.request
from pathlib import Path
HERE=Path(__file__).resolve().parent
def load(name,path):
    s=importlib.util.spec_from_file_location(name,path);m=importlib.util.module_from_spec(s);s.loader.exec_module(m);return m
photo=load('media_photo',HERE.parent/'photo-upload/release.py');cloud,images=photo.cloud,photo.images
cloud.BASE='https://hidiindia.com'
preserve=load('media_preserve',HERE.parent/'product-skn/release.py');patch=load('media_patch',HERE/'patch.py')
PRIVATE=Path(os.environ['RUNNER_TEMP'])/'hidi-paint-private';OUT=Path('evidence/paint-performance')
OUT.mkdir(parents=True,exist_ok=True);photo.PRIVATE,photo.EVIDENCE=PRIVATE,OUT
def save(name,value): (OUT/name).write_text(json.dumps(value,indent=2))
def selections():
    return {key:json.loads(cloud.get(path)) for key,path in [('hero','/api/hidi/hero-config'),('landing','/api/hidi/landing-media-config')]}
def capture():
    # Read-only preparation may overlap other testing; exact-state guards reject any changed live image.
    photo.capture();photo.backup()
    resources={}
    for name,app in photo.originals().items():
        properties=app.get('properties',{});template=properties.get('template') or {};scale=template.get('scale') or {};ingress=(properties.get('configuration') or {}).get('ingress') or {}
        resources[name]={'containers':[{'name':c.get('name'),'resources':c.get('resources'),
            'probes':[{'type':p.get('type'),'initialDelaySeconds':p.get('initialDelaySeconds'),'periodSeconds':p.get('periodSeconds'),'timeoutSeconds':p.get('timeoutSeconds'),'failureThreshold':p.get('failureThreshold'),'path':(p.get('httpGet') or {}).get('path'),'port':(p.get('httpGet') or {}).get('port')} for p in (c.get('probes') or [])]} for c in template.get('containers',[])],
            'scale':{key:scale.get(key) for key in ['minReplicas','maxReplicas','pollingInterval','cooldownPeriod']},
            'ingress':{key:ingress.get(key) for key in ['targetPort','external','transport','allowInsecure']}}
    save('runtime-resources.json',resources)
    selected=selections();(PRIVATE/'selections.json').write_text(json.dumps(selected));save('published-selections.json',selected)
    (PRIVATE/'catalogue.json').write_bytes(cloud.get('/api/store/products'))
def compose():
    photo.require_backups();photo.unchanged(photo.states())
    folder=PRIVATE/'web';folder.mkdir();base=folder/'base-app';overlay=folder/'overlay';candidate=folder/'candidate-app'
    image=photo.states()['hidi-web']['image'];images.extract(image,base)
    icons=patch.build_icons(base,overlay);save('icon-quality.json',icons)
    subprocess.run(['node',str(HERE/'posters.mjs'),str(base),str(overlay)],check=True)
    poster=json.loads((overlay/'poster-build.json').read_text());save('poster-quality.json',poster['report']);save('video-quality.json',poster['videoReport']);(overlay/'poster-build.json').unlink()
    # Keep all original CSS inline: production traces showed the extra sheet request delayed first paint.
    (overlay/'paint-performance').mkdir(parents=True,exist_ok=True)
    (overlay/'paint-performance/critical-css.json').write_text(json.dumps({'styles':{}}))
    save('critical-css-quality.json',{'strategy':'full-inline','allSourceCssPreserved':True,'deferredStyles':0})
    report=patch.patch_web(base,overlay,poster,icons);manifest=report.pop('manifest')
    subprocess.run(['node',str(HERE/'precompress.mjs'),str(overlay),report['bundle'],str(OUT/'static-encoding-quality.json')],check=True)
    report['allowedFiles']=sorted(p.relative_to(overlay).as_posix() for p in overlay.rglob('*') if p.is_file())
    save('patch.json',report);save('manifest.json',manifest)
    for name in report['allowedFiles']:
        if name.endswith(('.js','.mjs')):subprocess.run(['node','--check',str(overlay/name)],check=True)
    tag=os.environ['CANDIDATE_WEB'];assert re.fullmatch(re.escape(images.REGISTRY+'/hidi-web:paint-performance-')+r'\d+',tag)
    (folder/'Dockerfile').write_text('FROM '+image+'\nCOPY --chown=node:node overlay/ /app/\n')
    subprocess.run(['docker','build','--pull=false','-t',tag,str(folder)],check=True);images.extract(tag,candidate)
    proof=preserve.verify(base,candidate,overlay,set(report['allowedFiles']),json.loads(images.docker('image','inspect',image,tag)))
    assert all((candidate/p).read_bytes()==(base/p).read_bytes() for p in images.fingerprints(base) if p.endswith('.css'))
    proof.update({'allExistingCssIdentical':True,'originalUploadsPreserved':True,'nextStorefrontIdentical':True})
    assert not any(name.startswith(('pricing/','apps/web/')) for name in report['allowedFiles']),'Commerce files must remain outside the performance overlay'
    assert (candidate/'pricing/storefront.mjs').read_bytes()==(base/'pricing/storefront.mjs').read_bytes()
    save('commerce-preservation.json',{'passed':True,'allPricingAndNextFilesByteIdentical':True,'homepageLoaderOnly':True,'globalPricingSourceSha256':report['globalPricingSourceSha256']})
    save('preservation.json',proof);photo.unchanged(photo.states())
def wait(image,suffix,baseline):
    for _ in range(120):
        state=cloud.snapshot(cloud.app('hidi-web'));assert state['settingsHash']==baseline['settingsHash']
        assert state['image'] in (image,baseline['image']),'Independent web rollout'
        if state['image']==image and state['latest']==state['ready']=='hidi-web--'+suffix:return state
        time.sleep(5)
    raise AssertionError('Readiness timeout')
def apply():
    before=photo.states();photo.require_backups();photo.unchanged(before)
    for name in ['preservation.json','candidate.json','visual-comparison.json','fallback-safety.json','static-encoding-quality.json','protocol-comparison.json','commerce-preservation.json','initial-css-candidate.json','poster-cache-candidate.json']:
        assert json.loads((OUT/name).read_text())['passed'],name+' must pass'
    checkout=json.loads((OUT/'checkout-candidate/report.json').read_text());assert checkout['passed'] and len(checkout['cases'])==24 and not checkout['runtimeErrors'] and checkout['productionWrites']==0
    for row in json.loads((OUT/'lighthouse/candidate.json').read_text()):
        assert row['score']>=93 and row['cls']<=.1
        assert row['device']!='mobile' or row['lcp']<2200
    assert selections()==json.loads((PRIVATE/'selections.json').read_text()),'Published media changed during preparation'
    image=os.environ['WEB_IMAGE'];assert re.fullmatch(re.escape(images.REGISTRY+'/hidi-web@sha256:')+r'[a-f0-9]{64}',image)
    protected=photo.public_state();suffix='paintperf'+os.environ['GITHUB_RUN_ID']+'a'+os.environ.get('GITHUB_RUN_ATTEMPT','1')
    def interrupted(signum,frame):
        signal.signal(signal.SIGTERM,signal.SIG_IGN)
        raise InterruptedError('Owned rollout interrupted; restore the original image')
    signal.signal(signal.SIGTERM,interrupted)
    try:
        cloud.write_image(photo.originals()['hidi-web'],image,suffix);state=wait(image,suffix,before['hidi-web'])
        for path in ['/health','/healthz','/api/store/health/ready','/','/collections/all','/cart','/checkout','/account','/admin','/admin/hero-media','/admin/landing-media']:
            cloud.get(path)
        subprocess.run(['node',str(HERE/'probe.mjs'),'https://hidiindia.com','live'],check=True,timeout=600)
        subprocess.run(['node',str(HERE.parent/'checkout-hydration/probe.mjs'),'https://hidiindia.com',str(OUT/'checkout-live')],check=True,timeout=900,env={**os.environ,'HIDI_BROWSER_ENGINES':'chromium,firefox,webkit','HIDI_LOCAL_OVERLAY':'0'})
        subprocess.run(['node',str(HERE/'lighthouse.mjs'),'after'],check=True,timeout=600)
        assert photo.public_state()==protected,'Published configuration changed'
        assert cloud.snapshot(cloud.app('hidi-api'))==before['hidi-api'],'API changed independently'
        assert cloud.snapshot(cloud.app('hidi-web'))==state
        save('after.json',{'passed':True,'web':state,'apiUnchanged':True,'settingsPreserved':True,'publishedSelectionsPreserved':True,'databaseAndBlobWrites':False})
    except BaseException:
        data=cloud.app('hidi-web');current=cloud.snapshot(data)
        if current['image']==image and current['latest']=='hidi-web--'+suffix and current['settingsHash']==before['hidi-web']['settingsHash']:
            rollback='paintrollback'+os.environ['GITHUB_RUN_ID']+'a'+os.environ.get('GITHUB_RUN_ATTEMPT','1');cloud.write_image(data,before['hidi-web']['image'],rollback);wait(before['hidi-web']['image'],rollback,current);save('rollback.json',{'restored':True})
        raise
def deploy_capture():
    expected=json.loads((OUT/'before.json').read_text())
    selected=json.loads((OUT/'published-selections.json').read_text())
    photo.capture()
    assert photo.states()==expected,'Production changed after candidate verification; stop without replacing it'
    assert selections()==selected,'Selected media changed after candidate verification'
    (PRIVATE/'selections.json').write_text(json.dumps(selected))
if __name__=='__main__':
    import sys
    globals()[sys.argv[1]]()
