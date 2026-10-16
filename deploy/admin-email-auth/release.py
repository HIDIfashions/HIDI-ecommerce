"""Deploy narrowly reviewed staff-auth overlays, preserving settings and runtime bytes.
No staff accounts, provider configuration, schema or commerce data are changed.
"""
import argparse
import copy
import hashlib
import importlib.util
import io
import json
import os
import pathlib
import re
import shutil
import subprocess
import tarfile
import time

HERE = pathlib.Path(__file__).resolve().parent
ROOT = HERE.parent
BASELINE_SHA = '04447f465df48f3a9be5b6a5e2cde693dffa7823'
OLD_STEMS = {'admin/admin-auth', 'admin/admin-security.module'}
API_STEMS = OLD_STEMS | {'admin/admin-email-auth.controller'}
API_FILES = {'apps/api/dist/' + name + ext for name in API_STEMS for ext in ('.js', '.js.map')}
API_SOURCES = {'apps/api/src/' + name + '.ts' for name in API_STEMS}

def load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module)
    return module

helpers = load('admin_delete_images', ROOT / 'compose-msg91-images.py')
cloud = load('admin_delete_cloud', ROOT / 'privacy-policy/rollout.py')
cloud.API_VERSION = '2025-07-01'
cloud.BASE = 'https://hidiindia.com'
patcher = load('admin_delete_patcher', HERE / 'patch-runtime.py')
private = pathlib.Path(os.environ.get('RUNNER_TEMP', '/tmp')) / 'hidi-admin-email-private'
evidence = pathlib.Path('evidence/admin-email-auth')

def save(name, value):
    evidence.mkdir(parents=True, exist_ok=True)
    (evidence / name).write_text(json.dumps(value, indent=2))

def immutable(image, app):
    assert re.fullmatch(re.escape(helpers.REGISTRY + '/hidi-' + app) + r'@sha256:[0-9a-f]{64}', image), 'Expected an immutable HIDI image digest'

def require_owner_ready(api_state):
    report = json.loads((evidence / 'owner-preflight.json').read_text())
    assert report.get('safeToDeploy') is True and report.get('activeOwnerCount', 0) > 0 and report.get('readOnly') is True, 'An existing active Owner is required'
    assert report['states']['hidi-api'] == api_state, 'Owner preflight does not match captured API'
    for app in ['api', 'web']:
        backup = json.loads((evidence / (app + '-backup.json')).read_text())
        original = cloud.snapshot(json.loads((private / ('hidi-' + app + '.json')).read_text()))['image']
        assert backup['verified'] is True and backup['originalImage'] == original and backup['digest'] == original.split('@')[1], 'Verified rollback image required'

def baseline():
    """Compile immutable source independently of the reviewed working tree."""
    private.mkdir(parents=True, exist_ok=True); private.chmod(0o700)
    protected = ['package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml', 'apps/api/package.json', 'apps/api/tsconfig.json', 'apps/api/nest-cli.json', 'apps/api/prisma/schema.prisma']
    for name in protected:
        assert pathlib.Path(name).read_bytes() == subprocess.check_output(['git', 'show', BASELINE_SHA + ':' + name]), 'Dependency, schema or build configuration changed: ' + name
    changed = subprocess.check_output(['git', 'diff', '--name-only', BASELINE_SHA, '--', 'apps/api/src'], text=True).splitlines()
    assert set(changed) <= API_SOURCES, 'Unreviewed API source changes: ' + str(sorted(set(changed) - API_SOURCES))
    root = private / 'baseline-source'; root.mkdir()
    archive = subprocess.check_output(['git', 'archive', BASELINE_SHA, 'apps/api/src', 'apps/api/tsconfig.json', 'apps/api/package.json'])
    with tarfile.open(fileobj=io.BytesIO(archive)) as stream:
        stream.extractall(root, filter='data')
    api = root / 'apps/api'
    (api / 'node_modules').symlink_to(pathlib.Path('apps/api/node_modules').resolve(), target_is_directory=True)
    generated = api / 'src/generated/prisma'
    if not generated.exists():
        actual = pathlib.Path('apps/api/src/generated/prisma').resolve()
        assert actual.is_dir(), 'Generate the retained Prisma client before baseline compilation'
        generated.parent.mkdir(exist_ok=True)
        generated.symlink_to(actual, target_is_directory=True)
    subprocess.run(['pnpm', '--filter', '@hidi/api', 'exec', 'tsc', '-p', str(api / 'tsconfig.json')], check=True)
    save('baseline-source.json', {'sourceCommit': BASELINE_SHA, 'reviewedApiSourceFiles': sorted(changed), 'dependenciesAndSchemaUnchanged': True, 'baselineCompiled': True})
    print('Pinned API baseline compiled; unchanged dependencies and schema verified')

def capture():
    private.mkdir(parents=True, exist_ok=True); private.chmod(0o700)
    states = {}
    for name in ['hidi-web', 'hidi-api']:
        data = cloud.app(name); state = cloud.snapshot(data)
        cloud.ready(state); immutable(state['image'], name.removeprefix('hidi-'))
        target = private / (name + '.json'); target.write_text(json.dumps(data)); target.chmod(0o600)
        states[name] = state
    save('before.json', states)
    with open(os.environ['GITHUB_ENV'], 'a') as output:
        for name, state in states.items():
            output.write('EXPECTED_' + name.removeprefix('hidi-').upper() + '=' + state['image'] + '\n')
    print('Fresh ready API and web captured; private configuration and rollback images retained')

def verify(base, candidate, app, configs):
    before, after = helpers.fingerprints(base), helpers.fingerprints(candidate)
    changed = {name for name in before.keys() | after.keys() if before.get(name) != after.get(name)}
    allowed = API_FILES if app == 'api' else set(json.loads((evidence / 'web-patch.json').read_text())['allowedFiles'])
    assert changed and changed <= allowed, 'Application changed outside reviewed auth files: ' + str(sorted(changed - allowed))
    if app == 'api':
        baseline_dist = private / 'baseline-source/apps/api/dist'
        for stem in OLD_STEMS:
            old = base / ('apps/api/dist/' + stem + '.js')
            expected = baseline_dist / (stem + '.js')
            assert old.is_file() and expected.is_file() and old.read_bytes() == expected.read_bytes(), 'Live API differs from the pinned baseline: ' + stem
        assert {'apps/api/dist/' + stem + '.js' for stem in API_STEMS} <= changed, 'Admin eligibility controller or service missing from candidate'
        for name in API_FILES: assert (candidate / name).read_bytes() == pathlib.Path(name).read_bytes(), 'Candidate API differs from tested compilation'
    else:
        for name in allowed:
            expected = private / 'web/overlay' / name
            assert (candidate / name).read_bytes() == expected.read_bytes(), 'Candidate differs from bounded web patch'
        assert (candidate / 'apps/web/server.js').is_file() and (candidate / 'dist/index.html').is_file(), 'Retained combined storefront missing'
    first, last = configs
    assert first['Config'] == last['Config'], 'Image runtime configuration changed'
    layers = first['RootFS']['Layers']
    assert last['RootFS']['Layers'][:len(layers)] == layers, 'Retained image layers changed'
    return {'passed': True, 'changedFiles': sorted(changed), 'protectedFilesIdentical': len(before) - len(changed & before.keys()), 'runtimeConfigurationPreserved': True, 'baseLayersPreserved': True, 'apiBaselineVerified': app == 'api'}

def compose(app, tag):
    assert app in {'api', 'web'}
    name = 'hidi-' + app
    original = json.loads((private / (name + '.json')).read_text())
    base_image = cloud.snapshot(original)['image']
    immutable(base_image, app)
    folder = private / app; folder.mkdir()
    base, overlay, candidate = folder / 'base-app', folder / 'overlay', folder / 'candidate-app'
    helpers.extract(base_image, base)
    if app == 'api':
        assert not (base / 'apps/api/dist/admin/admin-email-auth.controller.js').exists(), 'Existing eligibility controller requires separate review'
        for stem in OLD_STEMS:
            actual = base / ('apps/api/dist/' + stem + '.js')
            baseline_file = private / ('baseline-source/apps/api/dist/' + stem + '.js')
            assert actual.is_file() and baseline_file.is_file() and actual.read_bytes() == baseline_file.read_bytes(), 'Live API differs from pinned baseline before composition: ' + stem
        for name in API_FILES:
            target = overlay / name; target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(name, target)
    else:
        report = patcher.patch_runtime(base, overlay)
        save('web-patch.json', report)
    (folder / 'Dockerfile').write_text('FROM ' + base_image + '\nCOPY --chown=node:node overlay/ /app/\n')
    subprocess.run(['docker', 'build', '--pull=false', '-t', tag, str(folder)], check=True)
    helpers.extract(tag, candidate)
    report = verify(base, candidate, app, json.loads(helpers.docker('image', 'inspect', base_image, tag)))
    report['baseImage'] = base_image
    save(app + '-preservation.json', report)
    print(app + ': actual candidate verified; every unrelated application file preserved')

def wait_ready(name, image, suffix):
    for attempt in range(60):
        data = cloud.app(name); state = cloud.snapshot(data)
        if state['image'] == image and state['latest'] == state['ready'] == name + '--' + suffix:
            return data
        time.sleep(10)
    raise RuntimeError('Candidate revision did not become ready: ' + name)

def public_state():
    paths = ['/', '/api/hidi/hero-config', '/api/hidi/landing-media-config', '/api/hidi/privacy-policy']
    return {name: hashlib.sha256(cloud.get(name)).hexdigest() for name in paths}

def post(path, body, expected):
    request = __import__('urllib.request', fromlist=['Request']).Request(cloud.BASE + path, data=json.dumps(body).encode(), headers={'content-type': 'application/json'}, method='POST')
    try:
        with __import__('urllib.request', fromlist=['urlopen']).urlopen(request, timeout=30) as response: status = response.status; payload = response.read(65536)
    except __import__('urllib.error', fromlist=['HTTPError']).HTTPError as error: status = error.code; payload = error.read(65536)
    assert status == expected, 'Unexpected admin eligibility response: ' + str(status)
    return json.loads(payload)

def verify_live_routes():
    for path in ['/health', '/api/store/health/ready', '/collections/all', '/cart', '/checkout', '/account', '/admin/sign-in', '/admin/products', '/admin/packing-scanner']:
        cloud.get(path)
    for path in ['/api/admin/products/options', '/api/admin/orders?status=CONFIRMED']:
        cloud.get(path, 401)
    body = post('/api/store/auth/admin/otp/request', {'email':'unlisted-admin-release@example.test'}, 403)
    assert body.get('message') == 'This email is not authorised for HIDI Admin', 'Eligibility denial must be explicit'
    post('/api/store/auth/admin/otp/request', {'email':'malformed'}, 400)
    post('/api/store/auth/admin/otp/request', {'email':'unlisted-admin-release@example.test','role':'OWNER'}, 400)
    html = cloud.get('/admin/sign-in').decode()
    assets = re.findall(r'/_next/static/chunks/app/admin/sign-in/page-[a-f0-9]{16}\.js', html)
    assert assets, 'Active sign-in browser asset missing'
    for asset in set(assets):
        code = cloud.get(asset).decode()
        assert '/api/store/auth/admin/otp/request' in code and '/auth/v1/otp' not in code, 'Live UI must gate OTP through HIDI'

def apply(api, web):
    images = {'hidi-api': api, 'hidi-web': web}
    old = {name: json.loads((private / (name + '.json')).read_text()) for name in images}
    before = {name: cloud.snapshot(data) for name, data in old.items()}
    for name, image in images.items():
        immutable(image, name.removeprefix('hidi-'))
        assert cloud.snapshot(cloud.app(name)) == before[name], 'Concurrent deployment changed ' + name + '; refusing rollout'
    require_owner_ready(before['hidi-api'])
    public = public_state(); owned = {}; run = os.environ['GITHUB_RUN_ID']
    try:
        # Publish the staff gate before the UI starts calling it.
        for name, image in images.items():
            assert cloud.snapshot(cloud.app(name)) == before[name], 'Concurrent release changed ' + name
            suffix = 'adminemail' + name.removeprefix('hidi-') + run
            owned[name] = image; cloud.write_image(old[name], image, suffix)
            state = cloud.snapshot(wait_ready(name, image, suffix))
            assert state['settingsHash'] == before[name]['settingsHash'], 'Protected app settings changed'
        verify_live_routes()
        assert public_state() == public, 'Published storefront, hero, media or privacy content changed'
        after = {name: cloud.snapshot(cloud.app(name)) for name in images}
        for name, state in after.items():
            assert state['image'] == images[name] and state['settingsHash'] == before[name]['settingsHash']
            cloud.ready(state)
        save('after.json', {'states': after, 'publicContentPreserved': True, 'appSettingsPreserved': True, 'productOrStorageMutations': False, 'anonymousAdminWritesDenied': True, 'existingActiveOwnerVerified': True, 'schemaMutations': False})
        print('PASS: admin email eligibility deployed; unlisted email denied; protected content and settings retained')
    except Exception:
        restored = []; failed = []
        for name, image in reversed(list(owned.items())):
            try:
                data = cloud.app(name); state = cloud.snapshot(data)
                if state['image'] == image and state['settingsHash'] == before[name]['settingsHash']:
                    suffix = 'adminemailrb' + name.removeprefix('hidi-') + run
                    cloud.write_image(old[name], before[name]['image'], suffix)
                    wait_ready(name, before[name]['image'], suffix); restored.append(name)
            except Exception:
                # An independent restoration failure must not prevent restoring
                # the other owned app. Never record private Azure error content.
                failed.append(name)
        save('rollback.json', {'restoredApps': restored, 'failedApps': failed, 'schemaMutations': False})
        raise

if __name__ == '__main__':
    parser = argparse.ArgumentParser(); parser.add_argument('action', choices=['baseline', 'capture', 'compose', 'apply'])
    parser.add_argument('--app'); parser.add_argument('--image'); parser.add_argument('--api'); parser.add_argument('--web')
    args = parser.parse_args()
    if args.action == 'baseline': baseline()
    elif args.action == 'capture': capture()
    elif args.action == 'compose': compose(args.app, args.image)
    else: apply(args.api, args.web)
