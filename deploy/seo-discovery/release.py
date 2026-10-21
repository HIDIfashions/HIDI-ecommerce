"""Guarded brand SEO and current image-discovery release over the captured live image, preserving commerce and backend behavior."""
import argparse
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import urllib.request
import urllib.error

HERE=Path(__file__).resolve().parent
def load(name,path):
    spec=importlib.util.spec_from_file_location(name,path);module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module);return module
guard=load('checkout_guard',HERE.parent/'range-five/release.py')
guard.PRIVATE=Path(os.environ.get('RUNNER_TEMP','/tmp'))/'hidi-seo-discovery-private'
guard.EVIDENCE=Path('evidence/seo-discovery')
guard.setup()
photo,cloud,images=guard.photo,guard.cloud,guard.images
cloud.BASE='https://hidiindia.com'
patcher=load('seo_discovery_patch',HERE/'patch-runtime.py')
body_guard=load('seo_body_preservation',HERE/'body-preservation.py')
PRIVATE,EVIDENCE=guard.PRIVATE,guard.EVIDENCE
def save(name,value):guard.save(name,value)
def read(name):return guard.read(name)
def digest(path):return hashlib.sha256(Path(path).read_bytes()).hexdigest()
def image_id(image):return json.loads(images.docker('image','inspect',image))[0]['Id']
def own_tag():return images.REGISTRY+'/hidi-web:seo-discovery-'+guard.run_key()
def retained_body_sample(path):
    document=cloud.get(path,headers=body_guard.CONFIG['requestHeaders'])
    normalized,evidence=body_guard.analyze(path,document)
    return document,normalized,evidence
def capture_retained_bodies():
    report={'passed':False,'readOnly':True,'sampleCount':3,'requestHeaders':body_guard.CONFIG['requestHeaders'],'routes':[]}
    expected={}
    for path in body_guard.CONFIG['routes']:
        samples=[retained_body_sample(path) for _ in range(report['sampleCount'])]
        normalized=[sample[1] for sample in samples]
        stable=all(value==normalized[0] for value in normalized)
        key='home' if path=='/' else path.strip('/').replace('/','-')
        retained=PRIVATE/('retained-body-'+key+'.bin');retained.write_bytes(normalized[0]);retained.chmod(0o600)
        expected[path]={'sha256':body_guard.sha256(normalized[0]),'length':len(normalized[0]),'privateFile':retained.name}
        report['routes'].append({'path':path,'normalizedStable':stable,'samples':[sample[2] for sample in samples]})
    report['passed']=all(route['normalizedStable'] for route in report['routes'])
    save('retained-body-before.json',report)
    guard.write_private('retained-public-bodies.json',expected)
    assert report['passed'],'Retained public baseline is not stable after exact reviewed normalization'
def verify_retained_bodies(report_name='retained-body-after.json'):
    expected=guard.private_json('retained-public-bodies.json')
    report={'passed':False,'readOnly':True,'sampleCount':3,'requestHeaders':body_guard.CONFIG['requestHeaders'],'routes':[]}
    for path,value in expected.items():
        baseline=(PRIVATE/value['privateFile']).read_bytes()
        assert body_guard.sha256(baseline)==value['sha256'] and len(baseline)==value['length'],'Private retained-body baseline changed'
        samples=[retained_body_sample(path) for _ in range(report['sampleCount'])]
        normalized=[sample[1] for sample in samples]
        stable=all(item==normalized[0] for item in normalized)
        exact=all(item==baseline for item in normalized)
        difference=next((body_guard.first_difference(baseline,item) for item in normalized if item!=baseline),None)
        report['routes'].append({'path':path,'normalizedStable':stable,'exactBaselineMatch':exact,'samples':[sample[2] for sample in samples],'firstDifference':difference})
    report['passed']=all(route['normalizedStable'] and route['exactBaselineMatch'] for route in report['routes'])
    save(report_name,report)
    assert report['passed'],'Retained public body changed; see '+report_name
def editorial_snapshot():
    class NoRedirect(urllib.request.HTTPRedirectHandler):
        def redirect_request(self,*args):return None
    try:
        response=urllib.request.build_opener(NoRedirect()).open(cloud.BASE+'/lookbook',timeout=25)
    except urllib.error.HTTPError as response:
        value={'status':response.code,'location':response.headers.get('Location'),'bodySha256':hashlib.sha256(response.read()).hexdigest()}
    else:
        with response:value={'status':response.status,'location':response.headers.get('Location'),'bodySha256':hashlib.sha256(response.read()).hexdigest()}
    if os.environ.get('HIDI_SEO_LOOKBOOK_RETIRED')=='1':
        assert value['status']==301 and value['location']=='/collections/all','Approved Lookbook retirement baseline changed'
    else:assert value['status']==200,'Retained editorial baseline changed'
    return value
def capture():
    photo.capture();before=photo.states();public=guard.public_snapshot();guard.write_private('public-before.json',public)
    image=before['hidi-web']['image'];guard.immutable(image,'web')
    tag=images.REGISTRY+'/hidi-web:backup-seo-discovery-'+guard.run_key()
    # Preserve the exact live OCI manifest/index, including the later analytics release.
    authfile=Path(os.environ.get('DOCKER_CONFIG',str(Path.home()/'.docker')))/'config.json'
    subprocess.run(['skopeo','copy','--all','--preserve-digests','--authfile',str(authfile),'docker://'+image,'docker://'+tag],check=True)
    value=subprocess.check_output(['az','acr','repository','show','--name','acrhidiprod0927','--image','hidi-web:backup-seo-discovery-'+guard.run_key(),'--query','digest','-o','tsv','--only-show-errors'],text=True).strip()
    assert value==image.split('@',1)[1],'Backup digest mismatch'
    save('web-backup.json',{'verified':True,'originalImage':image,'backupTag':tag,'digest':value,'settingsHash':before['hidi-web']['settingsHash']})
    capture_retained_bodies()
    guard.write_private('retained-editorial-response.json',editorial_snapshot())
    guard.write_private('retained-analytics.json',{'sha256':hashlib.sha256(cloud.get('/hidi-analytics.js')).hexdigest()})
    photo.unchanged(before);assert guard.public_snapshot()==public
    print('PASS: fresh ready baseline captured and exact web backup verified')
def backups():
    before=photo.states();report=read('web-backup.json');assert report['verified'] and report['originalImage']==before['hidi-web']['image'] and report['settingsHash']==before['hidi-web']['settingsHash']
    value=subprocess.check_output(['az','acr','repository','show','--name','acrhidiprod0927','--image','hidi-web:backup-seo-discovery-'+guard.run_key(),'--query','digest','-o','tsv','--only-show-errors'],text=True).strip()
    assert value==report['digest']==before['hidi-web']['image'].split('@',1)[1]
def compose():
    before=photo.states();backups();photo.unchanged(before)
    folder=PRIVATE/'web';folder.mkdir();base,overlay,candidate=(folder/n for n in ['base-app','overlay','candidate-app'])
    images.extract(before['hidi-web']['image'],base);plan=patcher.patch_runtime(base,overlay);save('patch.json',plan)
    for name in plan['allowedFiles']:
        if name.endswith(('.js', '.mjs')): subprocess.run(['node','--check',str(overlay/name)],check=True)
    (folder/'Dockerfile').write_text('FROM '+before['hidi-web']['image']+'\nCOPY --chown=node:node overlay/ /app/\n')
    subprocess.run(['docker','build','--pull=false','-t',own_tag(),str(folder)],check=True);images.extract(own_tag(),candidate)
    configs=json.loads(images.docker('image','inspect',before['hidi-web']['image'],own_tag()))
    report=guard.preserve.verify(base,candidate,overlay,set(plan['allowedFiles']),configs)
    report.update({'baseImage':before['hidi-web']['image'],'candidateImageId':image_id(own_tag()),'candidateTag':own_tag()});save('web-preservation.json',report)
    photo.unchanged(before);print('PASS: only reviewed SEO identity, Shop All search copy/breadcrumb/visibility, canonical-host routing, footer clearance and current product-image allowlist changed; retained navigation and About copy preserved')
def seal():
    photo.unchanged(photo.states());manifest={}
    for name in ['candidate/report.json','foundation-candidate/report.json','candidate-body-preservation.json','candidate-collection-body-delta.json','patch.json','web-preservation.json']:
        value=read(name);assert value.get('passed') is True,name+' must pass';manifest[name]=digest(EVIDENCE/name)
    candidate_report=read('candidate/report.json')
    assert candidate_report['engines']==['chromium','firefox','webkit'] and len(candidate_report['results'])==12
    assert candidate_report['liveWrites']==0
    assert candidate_report['collectionAllIntroVerified'] and candidate_report['collectionAllBreadcrumbVerified'] and candidate_report['collectionAllExactCopy']
    assert candidate_report['collectionAllMatrixCases']==12 and candidate_report['reviewedCollectionBodyDelta']=='/collections/all exact search copy, breadcrumb label, header visibility and intro insertion'
    assert all(any(check['page']=='catalogue' and check['collectionIntro']['heading']=='Women’s Kurta Sets & Indian Wear' and check['collectionIntro']['intro']=='Browse HIDI women’s kurta sets and Indian wear across work, casual and occasion edits. Compare product details, current prices and size information.' and check['collectionIntro']['breadcrumbLabel']=='Women’s Kurta Sets & Indian Wear' for check in result['checks']) for result in candidate_report['results'])
    foundation_report=read('foundation-candidate/report.json')
    assert len(foundation_report['results'])==12
    assert foundation_report['liveWrites']==0
    assert all(value['appearancePreserved'] for value in foundation_report['results'])
    assert all(value['collectionRetainedWhileAboutVerified'] is True for value in foundation_report['results'])
    body_report=read('candidate-body-preservation.json')
    assert body_report['readOnly'] and body_report['liveWrites']==0 and body_report['sampleCount']==3
    assert [route['route'] for route in body_report['routes']]==['/','/privacy']
    assert all(route['prior']['normalizedStable'] and route['candidate']['normalizedStable'] and route['exactNormalizedMatch'] for route in body_report['routes'])
    collection_report=read('candidate-collection-body-delta.json')
    assert collection_report['readOnly'] and collection_report['liveWrites']==0 and collection_report['sampleCount']==3
    assert collection_report['route']=='/collections/all' and collection_report['reviewedDelta']=='exact collection search copy, breadcrumb label, header visibility and intro insertion'
    assert collection_report['retainedExactBodyRoutes']==['/','/privacy']
    assert collection_report['prior']['stable'] and collection_report['candidate']['stable'] and collection_report['exactNormalizedBodyMatch']
    expected_operations=['visible header, H1 and intro','serialized header, H1 and intro','document title','Open Graph title','Twitter title','document description','Open Graph description','Twitter description','visible BreadcrumbList position 2 label','serialized BreadcrumbList position 2 label']
    assert collection_report['normalization']['mode']=='count-locked inverse transforms followed by byte equality'
    assert collection_report['normalization']['operations']==[{'label':label,'occurrences':1} for label in expected_operations]
    assert collection_report['normalizedBody']['prior']==collection_report['normalizedBody']['candidateAfterApprovedTransforms']
    assert all(sample['breadcrumbLabel']=='All Products' for sample in collection_report['prior']['samples'])
    assert all(sample['breadcrumbLabel']=='Women’s Kurta Sets & Indian Wear' for sample in collection_report['candidate']['samples'])
    assert collection_report['expected']=={'title':'Women’s Kurta Sets & Indian Wear','description':'Browse HIDI women’s kurta sets and Indian wear across work, casual and occasion edits. Compare product details, current prices and size information.'}
    patch_report=read('patch.json')
    assert patch_report['collectionAllIntroAdded'] and patch_report['collectionAllBreadcrumbUpdated'] and patch_report['collectionAllExactSearchCopyDelta']
    save('candidate-regression.json',{'passed':True,'candidateImageId':image_id(own_tag()),'reportManifest':manifest,'sourceSha':os.environ['GITHUB_SHA']})
def publish():
    seal();report=read('candidate-regression.json');subprocess.run(['docker','push',own_tag()],check=True)
    value=subprocess.check_output(['az','acr','repository','show','--name','acrhidiprod0927','--image','hidi-web:seo-discovery-'+guard.run_key(),'--query','digest','-o','tsv','--only-show-errors'],text=True).strip()
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
    suffix='seodiscovery'+guard.run_key('a');guard.write_private('forward-write.json',{'attempted':False,'mayComplete':False});guard.install_interrupt_handler()
    try:
        guard.conditional_write_image(photo.originals()['hidi-web'],image,suffix,'forward-write.json')
        state=cloud.snapshot(guard.wait_ready(image,suffix,before));assert state['settingsHash']==before['hidi-web']['settingsHash']
        guard.routes()
        subprocess.run(['node',str(HERE/'probes.mjs'),cloud.BASE,'evidence/seo-discovery/live'],check=True,timeout=1000)
        subprocess.run(['node',str(HERE.parent/'seo-foundation/browser.mjs'),cloud.BASE,'evidence/seo-discovery/foundation-live'],check=True,timeout=1000)
        verify_retained_bodies()
        assert editorial_snapshot()==guard.private_json('retained-editorial-response.json'),'Retained editorial response changed'
        assert hashlib.sha256(cloud.get('/hidi-analytics.js')).hexdigest()==guard.private_json('retained-analytics.json')['sha256'], 'Newer analytics asset changed'
        assert guard.public_snapshot()==captured,'Published media, privacy or public config changed'
        photo.unchanged({'hidi-api':before['hidi-api'],'hidi-web':state})
        save('after.json',{'passed':True,'states':{'hidi-api':before['hidi-api'],'hidi-web':state},'apiUnchanged':True,'publishedContentPreserved':True,'retainedPublicBodiesPreserved':True,'retainedPublicBodyRoutes':['/','/privacy'],'reviewedCollectionBodyDelta':'/collections/all exact search copy, breadcrumb label, header visibility and intro insertion','analyticsPreserved':True,'webSettingsPreserved':True,'sourceSha':os.environ['GITHUB_SHA'],'databaseWrites':False,'blobWrites':False})
        print('PASS: SEO identity, Shop All search copy and breadcrumb, crawling and sitemap released; live desktop/mobile checks passed')
    except Exception:
        marker=guard.private_json('forward-write.json');result=guard.reconcile_failure(image,before,captured,captured,suffix,bool(marker.get('mayComplete')));save('rollback.json',result);raise
def recover(image):
    before=photo.states();captured=guard.private_json('public-before.json');result=guard.reconcile_failure(image,before,captured,captured,'seodiscovery'+guard.run_key('a'),True);save('external-recovery.json',result);assert result.get('passed') is True;verify_retained_bodies('retained-body-recovery.json')
if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('mode',choices=['capture','compose','seal','publish','apply','recover']);parser.add_argument('--image');args=parser.parse_args()
    if args.mode in ['apply','recover']:globals()[args.mode](args.image)
    else:globals()[args.mode]()

