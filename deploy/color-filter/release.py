import importlib.util, json, os, re, subprocess, time
from pathlib import Path
HERE=Path(__file__).resolve().parent
def load(name,path):
    spec=importlib.util.spec_from_file_location(name,path);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);return m
photo=load('color_photo',HERE.parent/'photo-upload/release.py')
cloud,images=photo.cloud,photo.images
cloud.BASE='https://hidiindia.com'
preserve=load('color_preserve',HERE.parent/'product-skn/release.py')
patch=load('color_patch',HERE/'patch.py')
PRIVATE=Path(os.environ['RUNNER_TEMP'])/'hidi-color-private'
OUT=Path('evidence/color-filter');OUT.mkdir(parents=True,exist_ok=True)
photo.PRIVATE,photo.EVIDENCE=PRIVATE,OUT
def save(name,value): (OUT/name).write_text(json.dumps(value,indent=2))
def capture():
    photo.capture();photo.backup()
    (PRIVATE/'catalogue.json').write_bytes(cloud.get('/api/store/products'))
def compose():
    photo.require_backups();photo.unchanged(photo.states())
    folder=PRIVATE/'web';folder.mkdir();base=folder/'base-app';overlay=folder/'overlay';candidate=folder/'candidate-app'
    image=photo.states()['hidi-web']['image'];images.extract(image,base)
    report=patch.patch_web(base,overlay);save('patch.json',report)
    for name in report['allowedFiles']:
        if name.endswith('.js'):subprocess.run(['node','--check',str(overlay/name)],check=True)
    tag=os.environ['CANDIDATE_WEB'];assert re.fullmatch(re.escape(images.REGISTRY+'/hidi-web:color-filter-')+r'\d+',tag)
    (folder/'Dockerfile').write_text('FROM '+image+'\nCOPY --chown=node:node overlay/ /app/\n')
    subprocess.run(['docker','build','--pull=false','-t',tag,str(folder)],check=True)
    images.extract(tag,candidate)
    save('preservation.json',preserve.verify(base,candidate,overlay,set(report['allowedFiles']),json.loads(images.docker('image','inspect',image,tag))))
    photo.unchanged(photo.states())
def wait(image,suffix,baseline):
    for _ in range(120):
        state=cloud.snapshot(cloud.app('hidi-web'))
        assert state['settingsHash']==baseline['settingsHash']
        assert state['image'] in (image,baseline['image']), 'Independent rollout'
        if state['image']==image and state['latest']==state['ready']=='hidi-web--'+suffix:return state
        time.sleep(5)
    raise AssertionError('Web revision readiness timeout')
def apply():
    before=photo.states();photo.require_backups();photo.unchanged(before)
    for name in ['preservation.json','candidate.json']:
        assert json.loads((OUT/name).read_text())['passed']
    image=os.environ['WEB_IMAGE'];assert re.fullmatch(re.escape(images.REGISTRY+'/hidi-web@sha256:')+r'[a-f0-9]{64}',image)
    protected=photo.public_state();suffix='colors'+os.environ['GITHUB_RUN_ID']
    try:
        cloud.write_image(photo.originals()['hidi-web'],image,suffix)
        state=wait(image,suffix,before['hidi-web'])
        for path in ['/health','/healthz','/api/store/health/ready','/collections/all','/cart','/checkout','/account','/admin']:
            cloud.get(path)
        report=json.loads((OUT/'patch.json').read_text())
        for old,new in report['renamedAssets'].items():
            for name in [old,new]:
                expected=(PRIVATE/('web/base-app' if name==old else 'web/candidate-app')/name).read_bytes()
                assert cloud.get('/_next/'+name.split('apps/web/.next/',1)[1])==expected
        subprocess.run(['node','deploy/color-filter/probe.mjs','https://hidiindia.com','live'],check=True,timeout=600)
        assert photo.public_state()==protected
        assert cloud.snapshot(cloud.app('hidi-api'))==before['hidi-api']
        assert cloud.snapshot(cloud.app('hidi-web'))==state
        save('after.json',{'passed':True,'web':state,'apiUnchanged':True,'settingsPreserved':True,'publishedContentPreserved':True})
    except BaseException:
        data=cloud.app('hidi-web');current=cloud.snapshot(data)
        if current['image']==image and current['latest']=='hidi-web--'+suffix and current['settingsHash']==before['hidi-web']['settingsHash']:
            rollback='colorsrollback'+os.environ['GITHUB_RUN_ID'];cloud.write_image(data,before['hidi-web']['image'],rollback);wait(before['hidi-web']['image'],rollback,current)
            save('rollback.json',{'restored':True})
        raise
if __name__=='__main__':
    import sys
    globals()[sys.argv[1]]()
