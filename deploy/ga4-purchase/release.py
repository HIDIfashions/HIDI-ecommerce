"""Release one reviewed analytics asset over the exact current image."""
import argparse,hashlib,importlib.util,json,os,shutil,subprocess
from pathlib import Path
HERE=Path(__file__).resolve().parent
def load(name,path):
    spec=importlib.util.spec_from_file_location(name,path);module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module);return module
guard=load('ga4_guard',HERE.parent/'range-five/release.py')
guard.PRIVATE=Path(os.environ.get('RUNNER_TEMP','/tmp'))/'hidi-ga4-purchase-private';guard.EVIDENCE=Path('evidence/ga4-purchase');guard.setup()
photo,cloud,images=guard.photo,guard.cloud,guard.images
cloud.BASE='https://hidiindia.com'
BASE_SHA='01ef66b8c96c21ca76a499127684e4cef353821a7933816a309c0fa9e179d2d9'
def sha(data):return hashlib.sha256(data).hexdigest()
def tag():return images.REGISTRY+'/hidi-web:ga4-purchase-'+guard.run_key()
def image_id(name):return json.loads(images.docker('image','inspect',name))[0]['Id']
def capture():
    photo.capture();before=photo.states();guard.write_private('public-before.json',guard.public_snapshot())
    image=before['hidi-web']['image'];guard.immutable(image,'web')
    backup=images.REGISTRY+'/hidi-web:backup-ga4-purchase-'+guard.run_key()
    # Registry-side copying preserves OCI indexes and manifests byte-for-byte;
    # Docker pull/tag/push can normalize them into a different manifest digest.
    registry=subprocess.check_output(['az','acr','show','--name','acrhidiprod0927','--query','id','-o','tsv','--only-show-errors'],text=True).strip()
    subprocess.run(['az','acr','import','--name','acrhidiprod0927','--registry',registry,'--source',image.split('/',1)[1],'--image',backup.split('/',1)[1],'--only-show-errors','-o','none'],check=True)
    digest=subprocess.check_output(['az','acr','repository','show','--name','acrhidiprod0927','--image',backup.split('/',1)[1],'--query','digest','-o','tsv','--only-show-errors'],text=True).strip()
    assert digest==image.split('@',1)[1],'Exact backup digest required'
    guard.save('backup.json',{'verified':True,'originalImage':image,'backup':backup,'digest':digest})
    assert sha(cloud.get('/hidi-analytics.js'))==BASE_SHA,'Live analytics baseline changed'
    guard.write_private('page-bodies.json',{p:sha(cloud.get(p)) for p in ['/','/collections/all','/cart','/checkout','/account']})
    photo.unchanged(before);print('PASS: exact live image backed up and unchanged baseline captured')
def compose():
    before=photo.states();photo.unchanged(before)
    folder=guard.PRIVATE/'web';folder.mkdir();base,overlay,candidate=[folder/n for n in ['base','overlay','candidate']]
    images.extract(before['hidi-web']['image'],base)
    targets=[p for p in base.rglob('hidi-analytics.js') if p.is_file() and sha(p.read_bytes())==BASE_SHA]
    assert targets and len(targets)<=2,'Expected reviewed analytics assets only'
    assert any(p.relative_to(base).as_posix()=='dist/hidi-analytics.js' for p in targets),'Live landing analytics asset required'
    source=(HERE/'hidi-analytics.js').read_bytes();allowed=set()
    for path in targets:
        name=path.relative_to(base).as_posix();allowed.add(name);destination=overlay/name;destination.parent.mkdir(parents=True,exist_ok=True);destination.write_bytes(source)
    (folder/'Dockerfile').write_text('FROM '+before['hidi-web']['image']+'\nCOPY --chown=node:node overlay/ /app/\n')
    subprocess.run(['docker','build','--pull=false','-t',tag(),str(folder)],check=True);images.extract(tag(),candidate)
    preserved=guard.preserve.verify(base,candidate,overlay,allowed,json.loads(images.docker('image','inspect',before['hidi-web']['image'],tag())))
    preserved.update({'baseImage':before['hidi-web']['image'],'candidateImageId':image_id(tag()),'analyticsSha256':sha(source)})
    guard.save('preservation.json',preserved);photo.unchanged(before)
    print('PASS: only analytics assets changed; server, UI, dependencies and settings preserved')
def publish():
    photo.unchanged(photo.states());report=guard.read('candidate.json');preserved=guard.read('preservation.json')
    assert report['passed'] and report['liveWrites']==0 and len(report['results'])==2
    assert all(r['purchaseEvents']==1 and r['delayedPurchaseEvents']==1 and r['duplicatePurchases']==0 and r['reviewPurchases']==0 and r['failedPurchases']==0 and r['liveOrderWrites']==0 for r in report['results'])
    assert preserved['passed'] and report['sourceSha256']==preserved['analyticsSha256']
    subprocess.run(['docker','push',tag()],check=True)
    digest=subprocess.check_output(['az','acr','repository','show','--name','acrhidiprod0927','--image',tag().split('/',1)[1],'--query','digest','-o','tsv','--only-show-errors'],text=True).strip()
    image=images.REGISTRY+'/hidi-web@'+digest;guard.immutable(image,'web')
    assert image_id(tag())==preserved['candidateImageId']
    guard.save('published.json',{'verified':True,'image':image,'sourceSha':os.environ['GITHUB_SHA'],'report':report})
    with open(os.environ['GITHUB_ENV'],'a') as f:f.write('WEB_IMAGE='+image+'\n')
def apply(image):
    before=photo.states();photo.unchanged(before);published=guard.read('published.json');preserved=guard.read('preservation.json')
    assert published['verified'] and published['image']==image and published['sourceSha']==os.environ['GITHUB_SHA']
    assert preserved['baseImage']==before['hidi-web']['image'] and preserved['candidateImageId']==image_id(tag())
    assert guard.read('backup.json')['originalImage']==before['hidi-web']['image']
    captured=guard.private_json('public-before.json');assert guard.public_snapshot()==captured
    suffix='ga4purchase'+guard.run_key('a');guard.write_private('forward.json',{'attempted':False,'mayComplete':False});guard.install_interrupt_handler()
    try:
        guard.conditional_write_image(photo.originals()['hidi-web'],image,suffix,'forward.json')
        state=cloud.snapshot(guard.wait_ready(image,suffix,before));assert state['settingsHash']==before['hidi-web']['settingsHash']
        assert sha(cloud.get('/hidi-analytics.js'))==preserved['analyticsSha256'],'Deployed analytics source mismatch'
        for path,digest in guard.private_json('page-bodies.json').items():assert sha(cloud.get(path))==digest,'Page rendering changed: '+path
        guard.routes()
        subprocess.run(['node',str(HERE/'browser.mjs'),'--live'],check=True,timeout=240)
        assert guard.public_snapshot()==captured
        photo.unchanged({'hidi-api':before['hidi-api'],'hidi-web':state})
        guard.save('after.json',{'passed':True,'revision':state['ready'],'apiUnchanged':True,'webSettingsPreserved':True,'pageBodiesUnchanged':True,'liveCartWrites':0,'liveOrderWrites':0})
        print('PASS: analytics-only fix deployed; desktop/mobile cart and receipt tracking verified')
    except Exception:
        result=guard.reconcile_failure(image,before,captured,captured,suffix,bool(guard.private_json('forward.json').get('mayComplete')));guard.save('rollback.json',result);raise
def recover(image):
    before=photo.states();captured=guard.private_json('public-before.json');result=guard.reconcile_failure(image,before,captured,captured,'ga4purchase'+guard.run_key('a'),True);guard.save('recovery.json',result);assert result.get('passed')
if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('mode',choices=['capture','compose','publish','apply','recover']);parser.add_argument('--image');args=parser.parse_args()
    globals()[args.mode](args.image) if args.mode in ['apply','recover'] else globals()[args.mode]()
