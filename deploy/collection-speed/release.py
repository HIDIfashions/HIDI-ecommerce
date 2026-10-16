"""Release display-sized product images over freshly backed-up retained runtime."""
import argparse
import importlib.util
import json
import os
from pathlib import Path
import re
import subprocess
import time

HERE = Path(__file__).resolve().parent
PRIVATE = Path(os.environ.get('RUNNER_TEMP', '/tmp')) / 'hidi-collection-speed-private'
EVIDENCE = Path('evidence/collection-speed')

def load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module)
    return module

photo = load('collection_release_photo', HERE.parent / 'photo-upload/release.py')
cloud, images = photo.cloud, photo.images
cloud.BASE = 'https://hidiindia.com'
preserve = load('collection_release_preserve', HERE.parent / 'product-skn/release.py')
patcher = load('collection_release_patch', HERE / 'patch-web.py')

def setup():
    photo.PRIVATE, photo.EVIDENCE = PRIVATE, EVIDENCE
    EVIDENCE.mkdir(parents=True, exist_ok=True)

def capture():
    setup(); photo.capture(); photo.backup()
    for path in ('/api/hidi/hero-config','/api/hidi/landing-media-config','/api/hidi/privacy-policy'):
        (PRIVATE / (path.rsplit('/', 1)[1] + '.json')).write_bytes(cloud.get(path))
    (PRIVATE / 'catalogue.json').write_bytes(cloud.get('/api/store/products'))
    images.extract(photo.states()['hidi-api']['image'], PRIVATE / 'api/base-app')

def compose(tag):
    assert re.fullmatch(re.escape(images.REGISTRY + '/hidi-web') + r':collection-speed-[0-9]+', tag)
    photo.require_backups(); photo.unchanged(photo.states())
    folder = PRIVATE / 'web'; folder.mkdir()
    base, overlay, candidate = (folder / name for name in ('base-app', 'overlay', 'candidate-app'))
    images.extract(photo.states()['hidi-web']['image'], base)
    report = patcher.patch_web(base, overlay)
    subprocess.run(['node', str(HERE / 'seed.mjs')], check=True, timeout=900, env={**os.environ,
        'HIDI_CANDIDATE_RUNTIME': str(base), 'HIDI_IMAGE_SEED_DIR': str(overlay / 'product-images/seed')})
    report['allowedFiles'] += sorted(file.relative_to(overlay).as_posix() for file in (overlay / 'product-images/seed').iterdir() if file.is_file())
    photo.save('web-patch.json', report)
    for name in report['allowedFiles']:
        if name.endswith(('.js', '.mjs')): subprocess.run(['node', '--check', str(overlay / name)], check=True)
    (folder / 'Dockerfile').write_text('FROM ' + photo.states()['hidi-web']['image'] + '\nCOPY --chown=node:node overlay/ /app/\n')
    subprocess.run(['docker', 'build', '--pull=false', '-t', tag, str(folder)], check=True)
    images.extract(tag, candidate)
    verified = preserve.verify(base, candidate, overlay, set(report['allowedFiles']), json.loads(images.docker('image', 'inspect', photo.states()['hidi-web']['image'], tag)))
    verified.update({'baseImage': photo.states()['hidi-web']['image'], 'candidateTag': tag, 'apiUnchanged': True})
    photo.save('web-preservation.json', verified); photo.unchanged(photo.states())
    print('PASS: only image delivery and versioned display sources changed; unrelated runtime bytes and settings preserved')

def wait_ready(image, suffix, baseline):
    deadline = time.monotonic() + 600
    while time.monotonic() < deadline:
        data = cloud.app('hidi-web'); state = cloud.snapshot(data)
        assert state['settingsHash'] == baseline['settingsHash'], 'Application settings changed independently'
        if state['image'] == image and state['latest'] == state['ready'] == 'hidi-web--' + suffix: return data
        assert state['image'] in (baseline['image'], image) and state['latest'] in (baseline['latest'], 'hidi-web--' + suffix), 'Concurrent web deployment'
        time.sleep(5)
    raise AssertionError('Collection image revision did not become ready')

def apply():
    setup(); before = photo.states(); photo.require_backups(); photo.unchanged(before)
    for name in ('web-preservation.json', 'candidate.json', 'seed.json'):
        assert json.loads((EVIDENCE / name).read_text()).get('passed') is True, 'Image and collection regression required'
    assert json.loads(Path('evidence/four-categories/candidate.json').read_text()).get('passed') is True
    image = os.environ['WEB_IMAGE']; assert re.fullmatch(re.escape(images.REGISTRY + '/hidi-web') + r'@sha256:[a-f0-9]{64}', image)
    public_before = photo.public_state(); photo.save('public-live-before.json', public_before)
    assert photo.public_state() == public_before, 'Published content is changing independently'
    suffix = 'collectionspeed' + os.environ['GITHUB_RUN_ID']
    try:
        cloud.write_image(photo.originals()['hidi-web'], image, suffix)
        deployed = {'hidi-api': before['hidi-api'], 'hidi-web': cloud.snapshot(wait_ready(image, suffix, before['hidi-web']))}
        photo.unchanged(deployed)
        for path in ('/health','/healthz','/api/store/health/ready','/','/collections/casual-wear','/collections/all','/cart','/checkout','/account','/wishlist','/admin','/admin/import','/admin/product-bulk','/admin/products','/admin/inventory/receive','/admin/landing-media','/admin/packing-scanner'):
            cloud.get(path)
        for path in ('/api/admin/session','/api/admin/products/options','/api/admin/orders?status=CONFIRMED'): cloud.get(path, 401)
        report = json.loads((EVIDENCE / 'web-patch.json').read_text())
        for old, new in report['renamedAssets'].items():
            assert cloud.get('/_next/' + new.split('apps/web/.next/',1)[1]) == (PRIVATE / 'web/candidate-app' / new).read_bytes()
            assert cloud.get('/_next/' + old.split('apps/web/.next/',1)[1]) == (PRIVATE / 'web/base-app' / old).read_bytes()
        subprocess.run(['node', str(HERE / 'live.mjs')], check=True, timeout=600)
        assert photo.public_state() == public_before, 'Published content changed during deployment'
        photo.unchanged(deployed)
        photo.save('after.json', {'passed': True, 'states': deployed, 'sourceSha': os.environ['GITHUB_SHA'], 'apiUnchanged': True, 'appSettingsPreserved': True, 'publishedContentPreserved': True, 'databaseWrites': False, 'blobWrites': False})
        print('PASS: prepared product thumbnails live; actual desktop/mobile images and retained shopping routes verified')
    except Exception:
        data = cloud.app('hidi-web'); state = cloud.snapshot(data)
        if state['image'] == image and state['latest'] == 'hidi-web--' + suffix and state['settingsHash'] == before['hidi-web']['settingsHash']:
            rollback = 'collectionrollback' + os.environ['GITHUB_RUN_ID']
            cloud.write_image(data, before['hidi-web']['image'], rollback)
            recovery = cloud.snapshot(wait_ready(before['hidi-web']['image'], rollback, state))
        else: recovery = {'independentStatePreserved': True}
        photo.save('rollback.json', {'passed': True, 'state': recovery}); raise

if __name__ == '__main__':
    parser = argparse.ArgumentParser(); parser.add_argument('mode', choices=['capture','compose','apply']); parser.add_argument('--tag'); args = parser.parse_args()
    try:
        setup()
        if args.mode == 'compose': compose(args.tag)
        else: globals()[args.mode]()
    except Exception as error:
        print(str(error) if isinstance(error, (AssertionError, cloud.AzureOperationError)) else 'Collection release stopped; inspect bounded evidence')
        raise SystemExit(1)
