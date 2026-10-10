"""Independent customer category release over freshly captured Azure runtimes."""
import argparse
import importlib.util
import json
import os
from pathlib import Path
import pty
import re
import select
import shutil
import subprocess
import tarfile
import time
import hashlib

HERE = Path(__file__).resolve().parent
PRIVATE = Path(os.environ.get('RUNNER_TEMP', '/tmp')) / 'hidi-four-categories-private'
EVIDENCE = Path('evidence/four-categories')

def load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module)
    return module

photo = load('four_category_photo', HERE.parent / 'photo-upload/release.py')
cloud, images = photo.cloud, photo.images
transport = load('four_category_console', HERE.parent / 'product-skn/schema-check.py')
skn = load('four_category_preservation', HERE.parent / 'product-skn/release.py')
web = load('four_category_web_patch', HERE / 'patch-web.py')
landing = load('four_category_landing_patch', HERE / 'patch-landing.py')

def setup():
    photo.PRIVATE, photo.EVIDENCE = PRIVATE, EVIDENCE
    EVIDENCE.mkdir(parents=True, exist_ok=True)

def inspect():
    setup(); photo.capture(); photo.backup()
    collected = []
    for app in ('web', 'api'):
        root = PRIVATE / app / 'base-app'
        images.extract(photo.states()['hidi-' + app]['image'], root)
        selected = []
        if app == 'api':
            selected = ['apps/api/dist/products/products.service.js', 'apps/api/dist/products/products.service.js.map']
        else:
            index = root / 'dist/index.html'
            assert index.is_file(), 'Combined landing runtime required'
            selected = ['dist/index.html', 'server.mjs']
            for file in (root / 'dist/assets').glob('index-*.js'):
                if file.name in index.read_text(): selected.append(file.relative_to(root).as_posix())
            for file in (root / 'apps/web/.next').rglob('*'):
                if file.is_file() and file.suffix in ('.js', '.json', '.html', '.rsc') and file.stat().st_size < 4 * 1024 * 1024:
                    value = file.read_text(errors='replace')
                    if any(word in value for word in ('New Arrivals', 'Workwear Edit', 'Occasion', 'Everyday', 'Suggested searches')):
                        selected.append(file.relative_to(root).as_posix())
        with tarfile.open(EVIDENCE / (app + '-inspection.tar.gz'), 'w:gz') as archive:
            for name in selected:
                assert (root / name).is_file(), 'Required retained inspection module missing'
                archive.add(root / name, arcname=name)
        collected.append({'app': app, 'files': len(selected)})
    photo.unchanged(photo.states())
    photo.save('inspection.json', {'passed': True, 'captured': collected, 'liveApplicationsUnchanged': True, 'databaseWrites': False, 'blobWrites': False})
    print('PASS: immutable image/configuration backups and retained category modules captured; no production changes')

def capture():
    setup(); photo.capture(); photo.backup()
    for path in ('/api/hidi/hero-config','/api/hidi/landing-media-config','/api/hidi/privacy-policy'):
        (PRIVATE / (path.rsplit('/',1)[1]+'.json')).write_bytes(cloud.get(path))

def compose(app, tag):
    assert app in ('api','web') and re.fullmatch(re.escape(images.REGISTRY+'/hidi-'+app)+r':four-categories-[0-9]+',tag), 'Owned category image required'
    photo.require_backups(); photo.unchanged(photo.states())
    folder = PRIVATE / app; folder.mkdir()
    base,overlay,candidate = (folder/name for name in ('base-app','overlay','candidate-app'))
    images.extract(photo.states()['hidi-'+app]['image'],base)
    if app == 'api':
        stem = 'apps/api/dist/products/products.service'
        actual = (base/(stem+'.js')).read_text(); built = Path(stem+'.js').read_text()
        def surrounding(value):
            start=value.index('    async listPublished(');end=value.index('    async featured(',start)
            return value[:start],value[end:]
        assert surrounding(actual)==surrounding(built), 'API differs outside the one reviewed product category filter'
        allowed = {stem+'.js',stem+'.js.map'}
        for name in allowed:
            path=overlay/name;path.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(name,path)
    else:
        next_report=web.patch_web(base,overlay);landing_report=landing.patch_landing(base,overlay)
        photo.save('web-patch.json',next_report);photo.save('landing-patch.json',landing_report)
        allowed=set(next_report['allowedFiles'])|set(landing_report['allowedFiles'])
        for name in allowed:
            if name.endswith('.js'):subprocess.run(['node','--check',str(overlay/name)],check=True)
    (folder/'Dockerfile').write_text('FROM '+photo.states()['hidi-'+app]['image']+'\nCOPY --chown=node:node overlay/ /app/\n')
    subprocess.run(['docker','build','--pull=false','-t',tag,str(folder)],check=True)
    images.extract(tag,candidate)
    report=skn.verify(base,candidate,overlay,allowed,json.loads(images.docker('image','inspect',photo.states()['hidi-'+app]['image'],tag)))
    report.update({'baseImage':photo.states()['hidi-'+app]['image'],'candidateTag':tag})
    photo.save(app+'-preservation.json',report);photo.unchanged(photo.states())
    print('PASS: '+app+' category overlay preserves all unrelated live files, image configuration and original layers')

def console(data, payload):
    env={item['name']:item.get('value') for item in data['properties']['template']['containers'][0].get('env',[])}
    database=env.get('AZURE_SQL_DATABASE');assert isinstance(database,str) and database
    command=transport.console_command((HERE/'taxonomy.mjs').read_text(),database,'run',payload)
    master,slave=pty.openpty()
    process=subprocess.Popen(['az','containerapp','exec','-g',cloud.GROUP,'-n','hidi-api','--revision',data['properties']['latestReadyRevisionName'],
        '--container',data['properties']['template']['containers'][0]['name'],'--command','/bin/sh','--only-show-errors'],
        stdin=slave,stdout=slave,stderr=slave,start_new_session=True)
    os.close(slave);os.set_blocking(master,False);output=b'';pending=b'';sent=False
    try:
        deadline=time.monotonic()+180
        while time.monotonic()<deadline:
            readable,writable,_=select.select([master],[master] if pending else [],[],1)
            if writable:
                try:pending=pending[os.write(master,pending[:2048]):]
                except BlockingIOError:pass
            if readable:
                try:chunk=os.read(master,65536)
                except BlockingIOError:continue
                except OSError:break
                if not chunk:break
                output+=chunk;assert len(output)<512*1024,'Private taxonomy console limit'
                plain=transport.terminal_text(output.decode(errors='replace'))
                if not sent and re.search(r'(?:^|[\r\n])[^\r\n]{0,160}[#$] $',plain):pending=command.encode();sent=True
                if transport.complete_marker(plain,transport.MARKER) or transport.complete_marker(plain,transport.FAILURE_MARKER):break
            if process.poll() is not None:break
        plain=transport.terminal_text(output.decode(errors='replace'));report=transport.complete_marker(plain,transport.MARKER)
        if not report:
            failure=transport.complete_marker(plain,transport.FAILURE_MARKER) or {};code=failure.get('failureCode','PRIVATE_CATEGORY_CHECK_INCOMPLETE')
            assert re.fullmatch(r'[A-Z][A-Z0-9_]{0,79}',str(code));raise AssertionError(code)
        assert report.get('passed') is True and report.get('databaseHash')==hashlib.sha256(database.encode()).hexdigest()
        return report
    finally:
        os.close(master)
        if process.poll() is None:
            process.terminate()
            try:process.wait(timeout=10)
            except subprocess.TimeoutExpired:process.kill();process.wait(timeout=10)

def taxonomy():
    photo.require_backups();photo.unchanged(photo.states());data=photo.originals()['hidi-api']
    backup=console(data,{'mode':'inspect'});assert backup.get('readOnly') is True and backup.get('databaseWrites') is False
    path=PRIVATE/'taxonomy-references-backup.json';path.write_text(json.dumps(backup));path.chmod(0o600)
    photo.save('taxonomy-backup.json',{'verified':True,'databaseHash':backup['databaseHash'],'snapshotHash':backup['snapshotHash'],'counts':backup['counts'],'privateReferenceSnapshotSaved':True})
    report=console(data,{'mode':'ensure','snapshotHash':backup['snapshotHash']})
    assert report.get('taxonomyReady') is True and report.get('productAndStockRowsPreserved') is True and report.get('existingReferenceRowsPreserved') is True
    photo.save('taxonomy-ready.json',report);photo.unchanged(photo.states())
    print('PASS: four category references ready; existing product, size, price, image and stock rows preserved')

def wait_ready(name,image,suffix,baseline):
    deadline=time.monotonic()+600
    while time.monotonic()<deadline:
        data=cloud.app(name);state=cloud.snapshot(data)
        assert state['settingsHash']==baseline['settingsHash'],'Application settings changed independently'
        if state['image']==image and state['latest']==state['ready']==name+'--'+suffix:return data
        assert state['image'] in (baseline['image'],image) and state['latest'] in (baseline['latest'],name+'--'+suffix),'Concurrent deployment during category rollout'
        time.sleep(5)
    raise AssertionError('Category revision did not become ready')

def apply():
    setup();before=photo.states();photo.require_backups();photo.unchanged(before)
    for report in ('api-preservation.json','web-preservation.json','candidate.json','taxonomy-ready.json'):
        assert json.loads((EVIDENCE/report).read_text()).get('passed') is True,'Complete category regression and taxonomy readiness required'
    targets={name:os.environ[name.removeprefix('hidi-').upper()+'_IMAGE'] for name in before}
    for name,image in targets.items():assert re.fullmatch(re.escape(images.REGISTRY+'/'+name)+r'@sha256:[a-f0-9]{64}',image)
    assert photo.public_state()==json.loads((EVIDENCE/'public-before.json').read_text()),'Published media or policy changed independently'
    deployed={};run=os.environ['GITHUB_RUN_ID']
    try:
        for name in ('hidi-api','hidi-web'):
            expected={other:deployed.get(other,before[other]) for other in before};photo.unchanged(expected)
            suffix='fourcat'+name.removeprefix('hidi-')+run;cloud.write_image(photo.originals()[name],targets[name],suffix)
            deployed[name]=cloud.snapshot(wait_ready(name,targets[name],suffix,before[name]))
        for route in ('/health','/healthz','/api/store/health/ready','/','/collections/all','/cart','/checkout','/account','/wishlist',
                      '/admin','/admin/products','/admin/import','/admin/inventory/receive','/admin/products/price-tags','/admin/landing-media',
                      '/admin/packing-scanner','/admin/product-quick-fill','/admin/product-bulk','/admin/product-delete','/admin/privacy-policy'):
            cloud.get(route)
        for slug,title in web.CATEGORIES:
            html=cloud.get('/collections/'+slug);assert ('<h1>'+title+'</h1>').encode() in html,'Live category heading differs: '+slug
            data=json.loads(cloud.get('/api/store/products?category='+slug));assert isinstance(data,list)
            for product in data:
                tags={item['slug'] for item in product.get('collections',[])}
                if slug=='ananyas-pick':assert slug in tags,'Unselected product in Ananya collection'
                else:
                    legacy={'casual-wear':'everyday','work-wear':'work-edit','occasional-wear':'occasion'}[slug]
                    assert (product.get('category') or {}).get('slug')==slug or tags & {slug,legacy},'Product outside category selection'
        for route in ('/api/admin/products/options','/api/admin/orders?status=CONFIRMED','/api/hidi/privacy-policy/admin'):cloud.get(route,401)
        for report_name in ('web-patch.json','landing-patch.json'):
            plan=json.loads((EVIDENCE/report_name).read_text())
            for source,target in plan['renamedAssets'].items():
                url='/_next/'+target.split('apps/web/.next/',1)[1] if target.startswith('apps/web/.next/') else '/'+target.removeprefix('dist/')
                assert cloud.get(url)==(PRIVATE/'web/candidate-app'/target).read_bytes(),'Live immutable category asset differs'
        subprocess.run(['node','deploy/four-categories/live.mjs'],check=True,timeout=600)
        assert photo.public_state()==json.loads((EVIDENCE/'public-before.json').read_text()),'Published media or policy changed'
        photo.unchanged(deployed)
        photo.save('after.json',{'passed':True,'states':deployed,'categories':[title for _,title in web.CATEGORIES],
            'appSettingsPreserved':True,'publishedContentPreserved':True,'oldAssetsRetained':True,'existingProductRowsPreserved':True,
            'crossCategoryAnanyaPick':True,'sourceSha':os.environ['GITHUB_SHA'],'sknMigrationExecuted':False,'blobWrites':False})
        print('PASS: only Casual Wear, Work Wear, Occasional Wear and Ananya’s Pick are live on desktop and mobile; retained commerce and settings verified')
    except Exception:
        recovery={}
        for name in ('hidi-web','hidi-api'):
            data=cloud.app(name);state=cloud.snapshot(data);suffix='fourcat'+name.removeprefix('hidi-')+run
            if state['image']==targets[name] and state['latest']==name+'--'+suffix and state['settingsHash']==before[name]['settingsHash']:
                rollback='fourcatrollback'+name.removeprefix('hidi-')+run;cloud.write_image(data,before[name]['image'],rollback)
                recovery[name]=cloud.snapshot(wait_ready(name,before[name]['image'],rollback,state))
            else:recovery[name]={'independentStatePreserved':True}
        photo.save('rollback.json',{'passed':True,'states':recovery,'existingRowsUnchanged':True,'newEmptyTaxonomyReferencesRetained':True})
        raise

if __name__ == '__main__':
    parser = argparse.ArgumentParser(); parser.add_argument('mode', choices=['inspect','capture','compose','taxonomy','apply']);parser.add_argument('--app',choices=['api','web']);parser.add_argument('--tag');args = parser.parse_args()
    try:
        setup()
        if args.mode=='compose':compose(args.app,args.tag)
        else:globals()[args.mode]()
    except Exception as error:
        print(str(error) if isinstance(error, (AssertionError, cloud.AzureOperationError)) else 'Category inspection stopped; inspect bounded evidence')
        raise SystemExit(1)
