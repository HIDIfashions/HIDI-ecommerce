"""Guarded Image SKU mapping release; retains the live API, SQL schema and site."""
import argparse
import importlib.util
import json
import os
from pathlib import Path
import re
import subprocess

HERE=Path(__file__).resolve().parent
def load(name,path):
    spec=importlib.util.spec_from_file_location(name,path);module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module);return module
bulk=load('image_sku_bulk',HERE.parent/'bulk-publish/release.py')
patcher=load('image_sku_patch',HERE/'patch-web.py')
photo,cloud,images=bulk.photo,bulk.cloud,bulk.images
PRIVATE=Path(os.environ.get('RUNNER_TEMP','/tmp'))/'hidi-image-sku-private'
EVIDENCE=Path('evidence/image-sku')
def setup():
    bulk.PRIVATE,bulk.EVIDENCE=PRIVATE,EVIDENCE
    photo.PRIVATE,photo.EVIDENCE=PRIVATE,EVIDENCE
    EVIDENCE.mkdir(parents=True,exist_ok=True)
def capture():
    setup();bulk.capture()
def compose(tag):
    photo.require_backups();photo.unchanged(photo.states())
    assert re.fullmatch(re.escape(images.REGISTRY+'/hidi-web')+r':image-sku-[0-9]+',tag)
    folder=PRIVATE/'web';folder.mkdir();base,overlay,candidate=(folder/name for name in ('base-app','overlay','candidate-app'))
    images.extract(photo.states()['hidi-web']['image'],base)
    report=patcher.patch_web(base,overlay);photo.save('web-patch.json',report)
    for name in report['allowedFiles']:
        if name.endswith(('.js','.mjs')):subprocess.run(['node','--check',str(overlay/name)],check=True)
    (folder/'Dockerfile').write_text('FROM '+photo.states()['hidi-web']['image']+'\nCOPY --chown=node:node overlay/ /app/\n')
    subprocess.run(['docker','build','--pull=false','-t',tag,str(folder)],check=True);images.extract(tag,candidate)
    verified=bulk.preserve.verify(base,candidate,overlay,set(report['allowedFiles']),json.loads(images.docker('image','inspect',photo.states()['hidi-web']['image'],tag)))
    verified.update({'apiUnchanged':True,'baseImage':photo.states()['hidi-web']['image'],'candidateTag':tag});photo.save('web-preservation.json',verified);photo.unchanged(photo.states())
    print('PASS: Image SKU changes are confined to eight admin import files; current catalogue-speed fixes and all other runtime files preserved')
def apply():
    setup();before=photo.states();photo.require_backups();photo.unchanged(before)
    for path in (EVIDENCE/'web-preservation.json',EVIDENCE/'candidate.json',Path('evidence/bulk-publish/candidate.json'),Path('evidence/four-categories/candidate.json')):assert json.loads(path.read_text()).get('passed') is True,'Required retained regression proof missing'
    image=os.environ['WEB_IMAGE'];assert re.fullmatch(re.escape(images.REGISTRY+'/hidi-web')+r'@sha256:[a-f0-9]{64}',image)
    public_before=photo.public_state();photo.save('public-live-before.json',public_before);assert photo.public_state()==public_before,'Published media is changing; retry after the edit settles'
    suffix='imagesku'+os.environ['GITHUB_RUN_ID']
    try:
        cloud.write_image(photo.originals()['hidi-web'],image,suffix)
        deployed={'hidi-api':before['hidi-api'],'hidi-web':cloud.snapshot(bulk.wait_ready(image,suffix,before['hidi-web']))};photo.unchanged(deployed)
        for path in ('/health','/healthz','/api/store/health/ready','/','/collections/all','/cart','/checkout','/account','/wishlist','/admin/import','/admin/product-bulk','/admin/products','/admin/landing-media','/admin/packing-scanner'):cloud.get(path)
        for path in ('/api/admin/session','/api/admin/products/options','/api/hidi/product-image-skus'):cloud.get(path,401)
        report=json.loads((EVIDENCE/'web-patch.json').read_text())
        for name in ('navigation.js','image-sku-client.mjs'):assert cloud.get('/admin-tools-assets/'+name)==(PRIVATE/'web/candidate-app/admin-tools'/name).read_bytes(),'Live Image SKU asset differs'
        for old,new in report['renamedAssets'].items():
            assert cloud.get('/_next/'+new.split('apps/web/.next/',1)[1])==(PRIVATE/'web/candidate-app'/new).read_bytes(),'Live import asset differs'
            assert cloud.get('/_next/'+old.split('apps/web/.next/',1)[1])==(PRIVATE/'web/base-app'/old).read_bytes(),'Original immutable import asset changed'
        subprocess.run(['node','deploy/image-sku/live.mjs'],check=True,timeout=600)
        assert photo.public_state()==public_before,'Published media changed during deployment';photo.unchanged(deployed)
        photo.save('after.json',{'passed':True,'states':deployed,'sourceSha':os.environ['GITHUB_SHA'],'apiUnchanged':True,'appSettingsPreserved':True,'publishedContentPreserved':True,'imageSkuBulkMappingVerified':True,'sqlSchemaChanged':False,'productRowsModified':False,'blobWrites':False})
        print('PASS: Image SKU bulk mapping is live with persistent Azure storage; no products, photos, API or settings changed by deployment')
    except Exception:
        data=cloud.app('hidi-web');state=cloud.snapshot(data)
        if state['image']==image and state['latest']=='hidi-web--'+suffix and state['settingsHash']==before['hidi-web']['settingsHash']:
            rollback='imageskurollback'+os.environ['GITHUB_RUN_ID'];cloud.write_image(data,before['hidi-web']['image'],rollback);recovery=cloud.snapshot(bulk.wait_ready(before['hidi-web']['image'],rollback,state))
        else:recovery={'independentStatePreserved':True}
        photo.save('rollback.json',{'passed':True,'state':recovery});raise
if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('mode',choices=['capture','compose','apply']);parser.add_argument('--tag');args=parser.parse_args()
    try:
        setup()
        if args.mode=='compose':compose(args.tag)
        else:globals()[args.mode]()
    except Exception as error:
        print(str(error) if isinstance(error,(AssertionError,cloud.AzureOperationError)) else 'Image SKU release stopped; inspect bounded evidence');raise SystemExit(1)
