"""Fresh retained-runtime inspection for batch product saving and publication."""
import argparse
import importlib.util
import json
import os
from pathlib import Path
import re
import subprocess
import tarfile
import time

HERE = Path(__file__).resolve().parent
PRIVATE = Path(os.environ.get('RUNNER_TEMP', '/tmp')) / 'hidi-bulk-publish-private'
EVIDENCE = Path('evidence/bulk-publish')

def load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module)
    return module

photo = load('bulk_publish_photo', HERE.parent / 'photo-upload/release.py')
cloud, images = photo.cloud, photo.images
cloud.BASE = 'https://hidiindia.com'
preserve=load('bulk_publish_preserve',HERE.parent/'product-skn/release.py')
patcher=load('bulk_publish_patch',HERE/'patch-web.py')

def setup():
    photo.PRIVATE, photo.EVIDENCE = PRIVATE, EVIDENCE
    EVIDENCE.mkdir(parents=True, exist_ok=True)

def inspect():
    setup(); photo.capture(); photo.backup()
    counts = {}
    for app in ('web', 'api'):
        root = PRIVATE / app / 'base-app'
        images.extract(photo.states()['hidi-' + app]['image'], root)
        selected = []
        if app == 'web':
            selected = ['server.mjs']
            selected += [file.relative_to(root).as_posix() for file in (root / 'admin-tools').rglob('*') if file.is_file()]
            for file in (root / 'apps/web/.next').rglob('*'):
                if file.is_file() and file.suffix in ('.js', '.json', '.html', '.rsc') and file.stat().st_size < 4 * 1024 * 1024:
                    value = file.read_text(errors='replace')
                    if 'Products remain Draft' in value or '/admin/import' in file.as_posix():
                        selected.append(file.relative_to(root).as_posix())
        else:
            selected = ['apps/api/dist/admin/products/admin-products.service.js', 'apps/api/dist/admin/products/product-input.js']
        with tarfile.open(EVIDENCE / (app + '-inspection.tar.gz'), 'w:gz') as archive:
            for name in selected:
                assert (root / name).is_file(), 'Retained module missing: ' + name
                archive.add(root / name, arcname=name)
        counts[app] = len(selected)
    photo.unchanged(photo.states())
    photo.save('inspection.json', {'passed': True, 'files': counts, 'productionWrites': False})
    print('PASS: fresh production backups and bulk import modules captured without production writes')

def capture():
    setup();photo.capture();photo.backup()
    for path in ('/api/hidi/hero-config','/api/hidi/landing-media-config','/api/hidi/privacy-policy'):
        (PRIVATE/(path.rsplit('/',1)[1]+'.json')).write_bytes(cloud.get(path))
    images.extract(photo.states()['hidi-api']['image'],PRIVATE/'api/base-app')

def compose(tag):
    assert re.fullmatch(re.escape(images.REGISTRY+'/hidi-web')+r':bulk-publish-[0-9]+',tag),'Owned web image required'
    photo.require_backups();photo.unchanged(photo.states())
    folder=PRIVATE/'web';folder.mkdir();base,overlay,candidate=(folder/name for name in ('base-app','overlay','candidate-app'))
    images.extract(photo.states()['hidi-web']['image'],base)
    report=patcher.patch_web(base,overlay);photo.save('web-patch.json',report)
    for name in report['allowedFiles']:
        if name.endswith(('.js','.mjs')):subprocess.run(['node','--check',str(overlay/name)],check=True)
    (folder/'Dockerfile').write_text('FROM '+photo.states()['hidi-web']['image']+'\nCOPY --chown=node:node overlay/ /app/\n')
    subprocess.run(['docker','build','--pull=false','-t',tag,str(folder)],check=True);images.extract(tag,candidate)
    verified=preserve.verify(base,candidate,overlay,set(report['allowedFiles']),json.loads(images.docker('image','inspect',photo.states()['hidi-web']['image'],tag)))
    verified.update({'apiUnchanged':True,'baseImage':photo.states()['hidi-web']['image'],'candidateTag':tag});photo.save('web-preservation.json',verified);photo.unchanged(photo.states())
    print('PASS: only reviewed bulk admin files changed; customer theme, old assets, upload logic and image settings preserved')

def wait_ready(image,suffix,baseline):
    deadline=time.monotonic()+600
    while time.monotonic()<deadline:
        data=cloud.app('hidi-web');state=cloud.snapshot(data)
        assert state['settingsHash']==baseline['settingsHash'],'Application settings changed independently'
        if state['image']==image and state['latest']==state['ready']=='hidi-web--'+suffix:return data
        assert state['image'] in (baseline['image'],image) and state['latest'] in (baseline['latest'],'hidi-web--'+suffix),'Concurrent web deployment'
        time.sleep(5)
    raise AssertionError('Bulk publish revision did not become ready')

def apply():
    setup();before=photo.states();photo.require_backups();photo.unchanged(before)
    for name in ('web-preservation.json','candidate.json'):
        assert json.loads((EVIDENCE/name).read_text()).get('passed') is True,'Bulk save/publication regression required'
    assert json.loads(Path('evidence/four-categories/candidate.json').read_text()).get('passed') is True,'Four customer categories regression required'
    image=os.environ['WEB_IMAGE'];assert re.fullmatch(re.escape(images.REGISTRY+'/hidi-web')+r'@sha256:[a-f0-9]{64}',image)
    assert photo.public_state()==json.loads((EVIDENCE/'public-before.json').read_text()),'Published settings/content changed independently'
    suffix='bulkpublish'+os.environ['GITHUB_RUN_ID']
    try:
        cloud.write_image(photo.originals()['hidi-web'],image,suffix)
        deployed={'hidi-api':before['hidi-api'],'hidi-web':cloud.snapshot(wait_ready(image,suffix,before['hidi-web']))}
        photo.unchanged(deployed)
        for path in ('/health','/healthz','/api/store/health/ready','/','/collections/all','/cart','/checkout','/account','/wishlist','/admin','/admin/import','/admin/product-bulk','/admin/products','/admin/inventory/receive','/admin/landing-media','/admin/packing-scanner'):
            cloud.get(path)
        for path in ('/api/admin/session','/api/admin/products/options','/api/admin/orders?status=CONFIRMED'):cloud.get(path,401)
        report=json.loads((EVIDENCE/'web-patch.json').read_text())
        for name in ('navigation.js','product-bulk.mjs','product-publication.mjs','product-publication-panel.mjs'):
            assert cloud.get('/admin-tools-assets/'+name)==(PRIVATE/'web/candidate-app/admin-tools'/name).read_bytes(),'Live admin asset differs: '+name
        for old,new in report['renamedAssets'].items():
            assert cloud.get('/_next/'+new.split('apps/web/.next/',1)[1])==(PRIVATE/'web/candidate-app'/new).read_bytes(),'Live native import asset differs'
            assert cloud.get('/_next/'+old.split('apps/web/.next/',1)[1])==(PRIVATE/'web/base-app'/old).read_bytes(),'Original immutable import asset changed'
        subprocess.run(['node','deploy/bulk-publish/live.mjs'],check=True,timeout=600)
        assert photo.public_state()==json.loads((EVIDENCE/'public-before.json').read_text()),'Published content changed'
        photo.unchanged(deployed)
        photo.save('after.json',{'passed':True,'states':deployed,'sourceSha':os.environ['GITHUB_SHA'],'apiUnchanged':True,'appSettingsPreserved':True,'publishedContentPreserved':True,'bulkSaveAndPublishVerified':True,'databaseWrites':False,'blobWrites':False,'sknMigrationExecuted':False})
        print('PASS: bulk metadata saving and selected batch publication are live; Azure API, settings and customer experience preserved')
    except Exception:
        data=cloud.app('hidi-web');state=cloud.snapshot(data)
        if state['image']==image and state['latest']=='hidi-web--'+suffix and state['settingsHash']==before['hidi-web']['settingsHash']:
            rollback='bulkrollback'+os.environ['GITHUB_RUN_ID'];cloud.write_image(data,before['hidi-web']['image'],rollback)
            recovery=cloud.snapshot(wait_ready(before['hidi-web']['image'],rollback,state))
        else:recovery={'independentStatePreserved':True}
        photo.save('rollback.json',{'passed':True,'state':recovery});raise

if __name__ == '__main__':
    parser = argparse.ArgumentParser(); parser.add_argument('mode', choices=['inspect','capture','compose','apply']);parser.add_argument('--tag'); args = parser.parse_args()
    try:
        setup()
        if args.mode=='compose':compose(args.tag)
        else:globals()[args.mode]()
    except Exception as error:
        print(str(error) if isinstance(error, (AssertionError, cloud.AzureOperationError)) else 'Bulk inspection stopped; inspect bounded evidence')
        raise SystemExit(1)
