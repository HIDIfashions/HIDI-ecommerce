"""Four-file product overlay with exact-base backup, CAS deployment and owned rollback."""
import argparse, importlib.util, json, os, subprocess
from pathlib import Path
HERE=Path(__file__).resolve().parent
def load(name,path):
    spec=importlib.util.spec_from_file_location(name,path);mod=importlib.util.module_from_spec(spec);spec.loader.exec_module(mod);return mod
g=load('pdp_guard',HERE.parent/'range-five/release.py')
g.PRIVATE=Path(os.environ['RUNNER_TEMP'])/'hidi-product-page-private'
g.EVIDENCE=Path('evidence/product-page-release');g.setup()
photo,cloud,images=g.photo,g.cloud,g.images
P,E=g.PRIVATE,g.EVIDENCE
save,read=g.save,g.read
def tag(backup=False):return images.REGISTRY+'/hidi-web:'+('backup-product-page-' if backup else 'product-page-')+g.run_key()
def digest(image):return subprocess.check_output(['az','acr','repository','show','--name','acrhidiprod0927','--image',image.split('/',1)[1],'--query','digest','-o','tsv','--only-show-errors'],text=True).strip()
def capture():
    photo.capture();before=photo.states();g.write_private('public-before.json',g.public_snapshot())
    original=before['hidi-web']['image'];g.immutable(original,'web')
    auth=Path(os.environ.get('DOCKER_CONFIG',str(Path.home()/'.docker')))/'config.json'
    subprocess.run(['skopeo','copy','--all','--preserve-digests','--authfile',str(auth),'docker://'+original,'docker://'+tag(True)],check=True)
    assert digest(tag(True))==original.split('@')[1]
    save('backup.json',{'passed':True,'image':original,'backup':tag(True),'digest':digest(tag(True))});photo.unchanged(before)
def backups():
    proof=read('backup.json');assert proof['passed'] and proof['image']==photo.states()['hidi-web']['image'];assert digest(tag(True))==proof['digest']
def compose():
    backups();before=photo.states();photo.unchanged(before)
    folder=P/'web';folder.mkdir();base,overlay,candidate=(folder/n for n in ['base-app','overlay','candidate-app'])
    images.extract(before['hidi-web']['image'],base)
    subprocess.run(['node',str(HERE/'patch.mjs'),str(base),str(overlay)],check=True)
    subprocess.run(['node',str(HERE/'verify-patch.mjs'),str(base),str(overlay)],check=True)
    subprocess.run(['node',str(HERE/'verify-render.mjs'),str(base),str(overlay)],check=True)
    plan=read('patch.json');assert len(plan['allowedFiles'])==(2 if plan.get('kind')=='compact-mobile-css' else 4)
    assert all(n.startswith('apps/web/.next/') for n in plan['allowedFiles'])
    for name in plan['allowedFiles']:
        if name.endswith('.js'):subprocess.run(['node','--check',str(overlay/name)],check=True)
    (folder/'Dockerfile').write_text('FROM '+before['hidi-web']['image']+'\nCOPY --chown=node:node overlay/ /app/\n')
    subprocess.run(['docker','build','--pull=false','-t',tag(),str(folder)],check=True);images.extract(tag(),candidate)
    report=g.preserve.verify(base,candidate,overlay,set(plan['allowedFiles']),json.loads(images.docker('image','inspect',before['hidi-web']['image'],tag())))
    report['baseImage']=before['hidi-web']['image'];save('web-preservation.json',report);photo.unchanged(before)
def seal():
    photo.unchanged(photo.states());manifest={}
    for name in ['patch.json','web-preservation.json','candidate.json','short-candidate.json']:
        assert read(name)['passed'];manifest[name]=g.sha256_file(E/name)
    report=read('candidate.json');assert report['productionWrites']==0
    assert {(c['engine'],c['width']) for c in report['cases']}=={(e,w) for e in ['chromium','firefox','webkit'] for w in [320,390,768,1280,1440]}
    assert len(read('short-candidate.json')['cases'])==9
    save('sealed.json',{'passed':True,'sourceSha':os.environ['GITHUB_SHA'],'imageId':g.image_id(tag()),'manifest':manifest})
def publish():
    seal();subprocess.run(['docker','push',tag()],check=True);assert g.image_id(tag())==read('sealed.json')['imageId']
    image=images.REGISTRY+'/hidi-web@'+digest(tag());g.immutable(image,'web');save('published.json',{'passed':True,'image':image})
    with open(os.environ['GITHUB_ENV'],'a') as stream:stream.write('WEB_IMAGE='+image+'\n')
def verified():
    proof=read('sealed.json');assert proof['passed'] and proof['sourceSha']==os.environ['GITHUB_SHA']
    for name,sha in proof['manifest'].items():assert g.sha256_file(E/name)==sha
    return read('published.json')['image']
def recover():
    if not (P/'forward-write.json').exists():return
    image=verified();before=photo.states();captured=g.private_json('public-before.json');state=g.private_json('forward-write.json')
    report=g.reconcile_failure(image,before,captured,captured,'productpage'+g.run_key('a'),bool(state.get('mayComplete')));save('rollback.json',report);assert report['passed']
def apply():
    image=verified();backups();before=photo.states();photo.unchanged(before);captured=g.private_json('public-before.json');assert g.public_snapshot()==captured
    suffix='productpage'+g.run_key('a');g.install_interrupt_handler();g.write_private('forward-write.json',{'attempted':False,'mayComplete':False})
    try:
        g.conditional_write_image(photo.originals()['hidi-web'],image,suffix,'forward-write.json')
        deployed={'hidi-api':before['hidi-api'],'hidi-web':cloud.snapshot(g.wait_ready(image,suffix,before))};photo.unchanged(deployed)
        for path in ['/health','/healthz','/api/store/health/ready','/','/collections/all','/cart','/checkout','/account','/wishlist','/admin','/admin/products','/sitemap.xml','/robots.txt'] :cloud.get(path)
        for name in read('patch.json')['allowedFiles']:
            if '/static/' in name:
                url='/_next/'+name.split('/.next/')[1].replace('[slug]','%5Bslug%5D')
                assert cloud.get(url)==(P/'web/candidate-app'/name).read_bytes()
        subprocess.run(['node','tests/pdp-refinement.browser.mjs'],check=True,timeout=900,env={**os.environ,'PDP_BASE_URL':'https://hidiindia.com','HIDI_BROWSER_ENGINES':'chromium,firefox,webkit','HIDI_VERIFY_COLLECTION_NAVIGATION':'1'})
        subprocess.run(['node',str(HERE/'live-visual.mjs')],check=True,timeout=180)
        subprocess.run(['node',str(HERE/'short-mobile.mjs'),'https://hidiindia.com','live'],check=True,timeout=300)
        assert g.public_snapshot()==captured;photo.unchanged(deployed)
        save('after.json',{'passed':True,'sourceSha':os.environ['GITHUB_SHA'],'states':deployed,'apiUnchanged':True,'settingsPreserved':True,'databaseWrites':False,'blobWrites':False,'liveRegressionPassed':True})
    except Exception:
        recover();raise
if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('mode',choices=['capture','compose','seal','publish','apply','recover']);args=parser.parse_args();globals()[args.mode]()
