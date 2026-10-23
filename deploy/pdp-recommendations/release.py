"""Web-only approved footer, recommendations and reviews release, preserving the fresh live runtime."""
import argparse
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import subprocess

HERE=Path(__file__).resolve().parent
def load(name,path):
    spec=importlib.util.spec_from_file_location(name,path);module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module);return module
guard=load('checkout_guard',HERE.parent/'range-five/release.py')
guard.PRIVATE=Path(os.environ.get('RUNNER_TEMP','/tmp'))/'hidi-pdp-recommendations-private'
guard.EVIDENCE=Path('evidence/pdp-recommendations')
guard.setup()
photo,cloud,images=guard.photo,guard.cloud,guard.images
cloud.BASE='https://hidiindia.com'
patcher=load('pdp_recommendations_patch',HERE/'patch-runtime.py')
browser=load('pdp_browser',HERE/'browser-runner.py')
PRIVATE,EVIDENCE=guard.PRIVATE,guard.EVIDENCE
def save(name,value):guard.save(name,value)
def read(name):return guard.read(name)
def digest(path):return hashlib.sha256(Path(path).read_bytes()).hexdigest()
def image_id(image):return json.loads(images.docker('image','inspect',image))[0]['Id']
def own_tag():return images.REGISTRY+'/hidi-web:pdp-recommendations-'+guard.run_key()
def capture():
    photo.capture();before=photo.states();public=guard.public_snapshot();guard.write_private('public-before.json',public)
    image=before['hidi-web']['image'];guard.immutable(image,'web')
    tag=images.REGISTRY+'/hidi-web:backup-pdp-recommendations-'+guard.run_key()
    for args in [('pull',image),('tag',image,tag),('push',tag)]:subprocess.run(['docker',*args],check=True)
    value=subprocess.check_output(['az','acr','repository','show','--name','acrhidiprod0927','--image','hidi-web:backup-pdp-recommendations-'+guard.run_key(),'--query','digest','-o','tsv','--only-show-errors'],text=True).strip()
    assert value==image.split('@',1)[1],'Backup digest mismatch'
    save('web-backup.json',{'verified':True,'originalImage':image,'backupTag':tag,'digest':value,'settingsHash':before['hidi-web']['settingsHash']})
    photo.unchanged(before);assert guard.public_snapshot()==public
    print('PASS: fresh ready baseline captured and exact web backup verified')
def backups():
    before=photo.states();report=read('web-backup.json');assert report['verified'] and report['originalImage']==before['hidi-web']['image'] and report['settingsHash']==before['hidi-web']['settingsHash']
    value=subprocess.check_output(['az','acr','repository','show','--name','acrhidiprod0927','--image','hidi-web:backup-pdp-recommendations-'+guard.run_key(),'--query','digest','-o','tsv','--only-show-errors'],text=True).strip()
    assert value==report['digest']==before['hidi-web']['image'].split('@',1)[1]
def compose():
    before=photo.states();backups();photo.unchanged(before)
    assert digest(HERE.parents[1]/'apps/web/app/pdp-recommendations.css')==browser.CSS_SHA, 'CSS differs from approved preview'
    folder=PRIVATE/'web';folder.mkdir();base,overlay,candidate=(folder/n for n in ['base-app','overlay','candidate-app'])
    images.extract(before['hidi-web']['image'],base);plan=patcher.patch_runtime(base,overlay);save('patch.json',plan)
    for name in plan['allowedFiles']:
        if name.endswith(('.js','.mjs')): subprocess.run(['node','--check',str(overlay/name)],check=True)
    (folder/'Dockerfile').write_text('FROM '+before['hidi-web']['image']+'\nCOPY --chown=node:node overlay/ /app/\n')
    subprocess.run(['docker','build','--pull=false','-t',own_tag(),str(folder)],check=True);images.extract(own_tag(),candidate)
    configs=json.loads(images.docker('image','inspect',before['hidi-web']['image'],own_tag()))
    report=guard.preserve.verify(base,candidate,overlay,set(plan['allowedFiles']),configs)
    report.update({'baseImage':before['hidi-web']['image'],'candidateImageId':image_id(own_tag()),'candidateTag':own_tag()});save('web-preservation.json',report)
    photo.unchanged(before);print('PASS: only approved footer, recommendations and reviews changed; all other runtime bytes preserved')
def seal():
    photo.unchanged(photo.states());manifest={}
    for name in ['candidate/summary.json','candidate/report.json','candidate/commerce-report.json','candidate/runtime.json','candidate/catalogue-report.json','patch.json','web-preservation.json']:
        value=read(name);assert value.get('passed') is True,name+' must pass';manifest[name]=digest(EVIDENCE/name)
    browser.verify_reports('candidate')
    assert read('candidate/runtime.json')['upstreamWrites']==0
    assert read('candidate/runtime.json')['actualDockerImage']==own_tag()
    save('candidate-regression.json',{'passed':True,'candidateImageId':image_id(own_tag()),'reportManifest':manifest,'sourceSha':os.environ['GITHUB_SHA']})
def publish():
    seal();report=read('candidate-regression.json');subprocess.run(['docker','push',own_tag()],check=True)
    value=subprocess.check_output(['az','acr','repository','show','--name','acrhidiprod0927','--image','hidi-web:pdp-recommendations-'+guard.run_key(),'--query','digest','-o','tsv','--only-show-errors'],text=True).strip()
    image=images.REGISTRY+'/hidi-web@'+value;guard.immutable(image,'web');assert image_id(own_tag())==report['candidateImageId']
    save('published.json',{'verified':True,'image':image,**report})
    with open(os.environ['GITHUB_ENV'],'a') as stream:stream.write('WEB_IMAGE='+image+'\n')
def require_candidate(image):
    preserved,tested,published=read('web-preservation.json'),read('candidate-regression.json'),read('published.json')
    assert preserved['passed'] and preserved['baseImage']==photo.states()['hidi-web']['image']
    assert tested['passed'] and published['verified'] and published['image']==image
    assert preserved['candidateImageId']==tested['candidateImageId']==published['candidateImageId']
    assert tested['sourceSha']==published['sourceSha']==os.environ['GITHUB_SHA']
    for name,value in tested['reportManifest'].items():assert digest(EVIDENCE/name)==value,'Candidate evidence changed'
def apply(image):
    before=photo.states();backups();require_candidate(image);photo.unchanged(before);captured=guard.private_json('public-before.json');assert guard.public_snapshot()==captured
    suffix='pdpreviews'+guard.run_key('a');guard.write_private('forward-write.json',{'attempted':False,'mayComplete':False});guard.install_interrupt_handler()
    try:
        guard.conditional_write_image(photo.originals()['hidi-web'],image,suffix,'forward-write.json')
        state=cloud.snapshot(guard.wait_ready(image,suffix,before));assert state['settingsHash']==before['hidi-web']['settingsHash']
        guard.routes()
        browser.run('live',cloud.BASE)
        assert guard.public_snapshot()==captured,'Published media, privacy or public config changed'
        photo.unchanged({'hidi-api':before['hidi-api'],'hidi-web':state})
        save('after.json',{'passed':True,'states':{'hidi-api':before['hidi-api'],'hidi-web':state},'apiUnchanged':True,'publishedContentPreserved':True,'webSettingsPreserved':True,'sourceSha':os.environ['GITHUB_SHA'],'isolatedLiveCartTests':True,'ordersCreated':0,'blobWrites':False})
        print('PASS: approved footer, recommendations and reviews deployed; all live browser and commerce checks passed')
    except Exception:
        marker=guard.private_json('forward-write.json');result=guard.reconcile_failure(image,before,captured,captured,suffix,bool(marker.get('mayComplete')));save('rollback.json',result);raise
def recover(image):
    before=photo.states();captured=guard.private_json('public-before.json');result=guard.reconcile_failure(image,before,captured,captured,'pdpreviews'+guard.run_key('a'),True);save('external-recovery.json',result);assert result.get('passed') is True
if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('mode',choices=['capture','compose','seal','publish','apply','recover']);parser.add_argument('--image');args=parser.parse_args()
    if args.mode in ['apply','recover']:globals()[args.mode](args.image)
    else:globals()[args.mode]()

