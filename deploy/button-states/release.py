"""Add only the reviewed button assets and HTML hook to the ready live web image.

The API image, revision and settings are read-only invariants throughout capture,
composition, rollout and rollback. No database or Blob operation is performed.
"""
import argparse
import hashlib
import importlib.util
import json
import os
import pathlib
import re
import shutil
import subprocess
import sys
import time

HERE = pathlib.Path(__file__).resolve().parent
ROOT = HERE.parent
ASSETS = {'buttons.css', 'buttons.js', 'handler.mjs'}
WEB_FILES = {'server.mjs'} | {'button-states/' + name for name in ASSETS}
PINNED = {
    'hidi-web': 'sha256:a3a6f00f669d1768ab582d209cedc0c8e8b4fb82a656b9a380e6e46cf175d801',
    'hidi-api': 'sha256:063c3aee6a6c1c6300a3e5732ea40a2f94e18d947821b0ea8a608196ebf178c1',
}

def load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module)
    return module

helpers = load('button_states_images', ROOT / 'compose-msg91-images.py')
cloud = load('button_states_cloud', ROOT / 'privacy-policy/rollout.py')
cloud.API_VERSION = '2025-07-01'
private = pathlib.Path(os.environ.get('RUNNER_TEMP', '/tmp')) / 'hidi-button-states-private'
evidence = pathlib.Path('evidence/button-states')

def save(name, value):
    evidence.mkdir(parents=True, exist_ok=True)
    (evidence / name).write_text(json.dumps(value, indent=2))

def immutable(image, app='web'):
    assert re.fullmatch(re.escape(helpers.REGISTRY + '/hidi-' + app) + r'@sha256:[0-9a-f]{64}', image), 'IMMUTABLE_IMAGE_REQUIRED'

def candidate_tag(image):
    assert image == helpers.REGISTRY + '/hidi-web:button-states-' + os.environ['GITHUB_RUN_ID'], 'CANDIDATE_TAG_REQUIRED'

def originals():
    return {name: json.loads((private / (name + '.json')).read_text()) for name in PINNED}

def states():
    return {name: cloud.snapshot(data) for name, data in originals().items()}

def unchanged(expected):
    for name, state in expected.items():
        current = cloud.snapshot(cloud.app(name)); cloud.ready(current)
        assert current == state, 'CONCURRENT_APPLICATION_CHANGE: ' + name

def require_api(expected):
    state = cloud.snapshot(cloud.app('hidi-api')); cloud.ready(state)
    assert state == expected, 'API_STATE_CHANGED'

def capture():
    private.mkdir(parents=True, exist_ok=True); private.chmod(0o700)
    captured = {}
    for name, digest in PINNED.items():
        data = cloud.app(name); state = cloud.snapshot(data); cloud.ready(state)
        immutable(state['image'], name.removeprefix('hidi-'))
        assert state['image'] == helpers.REGISTRY + '/' + name + '@' + digest, 'REVIEWED_BASE_IMAGE_CHANGED: ' + name
        target = private / (name + '.json'); target.write_text(json.dumps(data)); target.chmod(0o600)
        captured[name] = state
    save('before.json', captured)
    with open(os.environ['GITHUB_ENV'], 'a') as output:
        for name, state in captured.items():
            output.write('EXPECTED_' + name.removeprefix('hidi-').upper() + '=' + state['image'] + '\n')
    print('Ready immutable API and web captured; complete app settings remain private')

def backup():
    before = states(); unchanged(before)
    for name, state in before.items():
        unchanged(before)
        app = name.removeprefix('hidi-')
        tag_name = 'backup-button-states-' + os.environ['GITHUB_RUN_ID']
        tag = helpers.REGISTRY + '/' + name + ':' + tag_name
        for args in [('pull', state['image']), ('tag', state['image'], tag), ('push', tag)]:
            subprocess.run(['docker', *args], check=True)
        digest = subprocess.check_output(['az', 'acr', 'repository', 'show', '--name', 'acrhidiprod0927', '--image', name + ':' + tag_name, '--query', 'digest', '-o', 'tsv', '--only-show-errors'], text=True).strip()
        assert digest == state['image'].split('@', 1)[1], 'BACKUP_DIGEST_MISMATCH: ' + name
        save(app + '-backup.json', {'originalImage': state['image'], 'backupTag': tag, 'digest': digest, 'verified': True, 'settingsHash': state['settingsHash']})
    unchanged(before)
    print('Both exact live image backups independently verified; applications unchanged')

def require_backups(before):
    for name, state in before.items():
        path = evidence / (name.removeprefix('hidi-') + '-backup.json')
        assert path.is_file(), 'VERIFIED_BACKUP_REQUIRED: ' + name
        report = json.loads(path.read_text())
        assert report.get('verified') is True and report.get('originalImage') == state['image'] and report.get('settingsHash') == state['settingsHash'] and report.get('digest') == state['image'].split('@', 1)[1], 'VERIFIED_BACKUP_MISMATCH: ' + name

def runtime_patch(source):
    return load('button_states_patch', HERE / 'patch-runtime.py').patch_runtime(source)

def verify(base, candidate, configs):
    first, last = helpers.fingerprints(base), helpers.fingerprints(candidate)
    changed = {name for name in first.keys() | last.keys() if first.get(name) != last.get(name)}
    assert changed == WEB_FILES, 'UNREVIEWED_WEB_FILES: ' + str(sorted(changed ^ WEB_FILES))
    assert (candidate / 'server.mjs').read_text() == runtime_patch((base / 'server.mjs').read_text()), 'UNEXPECTED_RUNTIME_PATCH'
    for name in ASSETS:
        assert (candidate / 'button-states' / name).read_bytes() == (HERE / name).read_bytes(), 'UNEXPECTED_BUTTON_ASSET: ' + name
    for name in ['apps/web/server.js', 'dist/index.html', 'admin-tools/handler.mjs', 'admin-tools/navigation.js', 'admin-tools/product-delete-handler.mjs', 'admin-tools/product-delete-storage.mjs', 'hero-media.mjs', 'privacy-policy/handler.mjs']:
        assert name in first and first[name] == last[name], 'RETAINED_FEATURE_MISSING: ' + name
    old, new = configs
    assert old['Config'] == new['Config'], 'IMAGE_CONFIGURATION_CHANGED'
    layers = old['RootFS']['Layers']
    assert new['RootFS']['Layers'][:len(layers)] == layers, 'BASE_IMAGE_LAYERS_CHANGED'
    return {'passed': True, 'changedFiles': sorted(changed), 'protectedFilesIdentical': len(first) - len(changed & first.keys()), 'compiledNextPreserved': True, 'landingHtmlPreserved': True, 'adminDeletionPreserved': True, 'runtimeConfigurationPreserved': True, 'baseLayersPreserved': True, 'apiModified': False}

def compose(image):
    candidate_tag(image)
    before = states(); require_backups(before); unchanged(before)
    base_image = before['hidi-web']['image']; immutable(base_image)
    folder = private / 'web'; folder.mkdir()
    base, overlay, candidate = folder / 'base-app', folder / 'overlay', folder / 'candidate-app'
    helpers.extract(base_image, base)
    assets = overlay / 'button-states'; assets.mkdir(parents=True)
    for name in ASSETS: shutil.copyfile(HERE / name, assets / name)
    (overlay / 'server.mjs').write_text(runtime_patch((base / 'server.mjs').read_text()))
    for path in [overlay / 'server.mjs', assets / 'handler.mjs', assets / 'buttons.js']:
        subprocess.run(['node', '--check', str(path)], check=True)
    (folder / 'Dockerfile').write_text('FROM ' + base_image + '\nCOPY --chown=node:node overlay/ /app/\n')
    subprocess.run(['docker', 'build', '--pull=false', '-t', image, str(folder)], check=True)
    helpers.extract(image, candidate)
    configs = json.loads(helpers.docker('image', 'inspect', base_image, image))
    report = verify(base, candidate, configs)
    report.update({'baseImage': base_image, 'candidateTag': image, 'candidateImageId': configs[1]['Id']})
    save('web-preservation.json', report); unchanged(before)
    print('Actual web candidate verified; every compiled, admin deletion and unrelated file retained')

def image_id(image):
    return json.loads(helpers.docker('image', 'inspect', image))[0]['Id']

def mark_tested(image):
    candidate_tag(image)
    preserved = json.loads((evidence / 'web-preservation.json').read_text())
    assert preserved.get('passed') is True and preserved['candidateTag'] == image and preserved['candidateImageId'] == image_id(image), 'TESTED_CANDIDATE_CHANGED'
    target = evidence / 'candidate/report.json'; report = json.loads(target.read_text())
    assert report.get('passed') is True and report.get('examinedControls', 0) > 0, 'CANDIDATE_REGRESSION_REQUIRED'
    assert report.get('sourceThemeInjected') is False and report.get('liveWrites') == 0, 'ACTUAL_CANDIDATE_WITHOUT_LIVE_WRITES_REQUIRED'
    assert report.get('results') and all(item.get('status') == 'PASS' for item in report['results']), 'CANDIDATE_REGRESSION_FAILURE'
    coverage = {(item.get('engine'), item.get('width'), item.get('height')) for item in report.get('results', []) if item.get('status') == 'PASS'}
    expected = {(engine, width, height) for engine in ['chromium', 'firefox', 'webkit'] for width, height in [(320, 568), (390, 844), (844, 390), (1440, 900)]}
    assert coverage == expected, 'CANDIDATE_BROWSER_COVERAGE_INCOMPLETE'
    save('candidate-regression.json', {'passed': True, 'candidateImageId': preserved['candidateImageId'], 'sourceSha': os.environ['GITHUB_SHA'], 'reportSha256': hashlib.sha256(target.read_bytes()).hexdigest(), 'browserEngines': ['chromium', 'firefox', 'webkit'], 'viewportCount': 4, 'realCommerceWrites': False})

def publish(image):
    candidate_tag(image)
    preserved = json.loads((evidence / 'web-preservation.json').read_text())
    tested = json.loads((evidence / 'candidate-regression.json').read_text())
    assert tested.get('passed') is True and tested.get('candidateImageId') == preserved.get('candidateImageId') == image_id(image), 'PUBLISH_REQUIRES_TESTED_IMAGE'
    assert tested.get('sourceSha') == os.environ['GITHUB_SHA'], 'TESTED_SOURCE_CHANGED'
    unchanged(states())
    subprocess.run(['docker', 'push', image], check=True)
    digest = subprocess.check_output(['az', 'acr', 'repository', 'show', '--name', 'acrhidiprod0927', '--image', 'hidi-web:button-states-' + os.environ['GITHUB_RUN_ID'], '--query', 'digest', '-o', 'tsv', '--only-show-errors'], text=True).strip()
    immutable_image = helpers.REGISTRY + '/hidi-web@' + digest; immutable(immutable_image)
    subprocess.run(['docker', 'pull', immutable_image], check=True)
    assert image_id(immutable_image) == tested['candidateImageId'], 'PUBLISHED_IMAGE_DIFFERS_FROM_TESTED'
    save('published.json', {'image': immutable_image, 'candidateImageId': tested['candidateImageId'], 'sourceSha': os.environ['GITHUB_SHA'], 'verified': True})
    with open(os.environ['GITHUB_ENV'], 'a') as output: output.write('IMAGE_WEB=' + immutable_image + '\n')
    print('Published immutable web image independently matches the tested candidate')

def require_candidate(image, before):
    preserved = json.loads((evidence / 'web-preservation.json').read_text())
    tested = json.loads((evidence / 'candidate-regression.json').read_text())
    published = json.loads((evidence / 'published.json').read_text())
    assert preserved.get('passed') is True and preserved.get('baseImage') == before['hidi-web']['image'] and set(preserved.get('changedFiles', [])) == WEB_FILES, 'PRESERVED_BASE_MISMATCH'
    assert tested.get('passed') is True and published.get('verified') is True and published.get('image') == image, 'TESTED_IMMUTABLE_CANDIDATE_REQUIRED'
    assert preserved.get('candidateImageId') == tested.get('candidateImageId') == published.get('candidateImageId'), 'CANDIDATE_IMAGE_ID_MISMATCH'
    assert tested.get('sourceSha') == published.get('sourceSha') == os.environ['GITHUB_SHA'], 'CANDIDATE_SOURCE_MISMATCH'

def wait_ready(image, suffix, api):
    for attempt in range(60):
        require_api(api)
        data = cloud.app('hidi-web'); state = cloud.snapshot(data)
        if state['image'] == image and state['latest'] == state['ready'] == 'hidi-web--' + suffix:
            cloud.ready(state); return data
        time.sleep(10)
    raise RuntimeError('WEB_REVISION_NOT_READY')

def public_state():
    result = {}
    for path in ['/api/hidi/hero-config', '/api/hidi/landing-media-config', '/api/hidi/privacy-policy', '/config.js']:
        raw = cloud.get(path)
        if path.startswith('/api/'): raw = json.dumps(json.loads(raw), sort_keys=True, separators=(',', ':')).encode()
        result[path] = hashlib.sha256(raw).hexdigest()
    return result

def verify_live_routes():
    for path in ['/health', '/healthz', '/api/store/health/ready', '/', '/collections/all', '/cart', '/checkout', '/account', '/wishlist', '/shipping', '/returns', '/admin', '/admin/products', '/admin/products/price-tags', '/admin/landing-media', '/admin/packing-scanner', '/admin/product-quick-fill', '/admin/product-bulk', '/admin/product-delete', '/admin/privacy-policy']:
        cloud.get(path)
    for name in ['buttons.css', 'buttons.js']:
        assert cloud.get('/button-states/' + name) == (HERE / name).read_bytes(), 'LIVE_BUTTON_ASSET_MISMATCH: ' + name
    cloud.get('/button-states/handler.mjs', 404)
    for name in ['navigation.js', 'product-delete.mjs', 'product-delete-links.js']:
        assert cloud.get('/admin-tools-assets/' + name) == (ROOT / 'admin-tools' / name).read_bytes(), 'LIVE_ADMIN_ASSET_CHANGED: ' + name
    for path in ['/api/admin/products/options', '/api/admin/orders?status=CONFIRMED', '/api/hidi/privacy-policy/admin', '/api/hidi/product-deletion/nonexistent-button-fixture']:
        cloud.get(path, 401)

def apply(image):
    immutable(image)
    old = originals(); before = {name: cloud.snapshot(data) for name, data in old.items()}
    require_backups(before); require_candidate(image, before); unchanged(before)
    public = public_state(); owned = False; run = os.environ['GITHUB_RUN_ID']
    try:
        unchanged(before)
        suffix = 'buttonstates' + run; owned = True
        cloud.write_image(old['hidi-web'], image, suffix)
        current = cloud.snapshot(wait_ready(image, suffix, before['hidi-api']))
        assert current['settingsHash'] == before['hidi-web']['settingsHash'], 'WEB_SETTINGS_CHANGED'
        require_api(before['hidi-api']); verify_live_routes()
        subprocess.run(['node', str(HERE / 'probes.mjs'), cloud.BASE, str(evidence / 'live')], check=True, timeout=900)
        require_api(before['hidi-api'])
        assert public_state() == public, 'PROTECTED_PUBLIC_CONTENT_CHANGED'
        after = {name: cloud.snapshot(cloud.app(name)) for name in before}
        assert after['hidi-api'] == before['hidi-api'], 'API_STATE_CHANGED'
        assert after['hidi-web']['image'] == image and after['hidi-web']['settingsHash'] == before['hidi-web']['settingsHash'], 'WEB_STATE_CHANGED'
        cloud.ready(after['hidi-web'])
        save('after.json', {'states': after, 'apiUnchanged': True, 'webSettingsPreserved': True, 'publicContentPreserved': True, 'compiledNextPreserved': True, 'adminDeletionPreserved': True, 'databaseWrites': False, 'blobWrites': False})
        print('PASS: button states deployed to ready web only; API and prior features preserved')
    except Exception:
        status = 'not-owned'; failure = False
        try:
            data = cloud.app('hidi-web'); current = cloud.snapshot(data)
            if owned and current['image'] == image and current['settingsHash'] == before['hidi-web']['settingsHash']:
                suffix = 'buttonstatesrb' + run
                cloud.write_image(old['hidi-web'], before['hidi-web']['image'], suffix)
                # API drift cannot prevent restoration of our owned web image.
                cloud.wait_ready(before['hidi-web']['image'], suffix); status = 'restored'
            elif current['image'] == before['hidi-web']['image'] and current['settingsHash'] == before['hidi-web']['settingsHash']:
                status = 'original-image-retained'
        except Exception:
            failure = True; status = 'restore-failed'
        api_unchanged = False
        try: api_unchanged = cloud.snapshot(cloud.app('hidi-api')) == before['hidi-api']
        except Exception: pass
        save('rollback.json', {'webStatus': status, 'rollbackFailed': failure, 'apiUnchanged': api_unchanged, 'apiWrites': False, 'databaseWrites': False, 'blobWrites': False})
        raise

def main():
    parser = argparse.ArgumentParser(); parser.add_argument('action', choices=['capture', 'backup', 'compose', 'mark-tested', 'publish', 'apply']); parser.add_argument('--image')
    args = parser.parse_args()
    if args.action == 'capture': capture()
    elif args.action == 'backup': backup()
    elif args.action == 'compose': compose(args.image)
    elif args.action == 'mark-tested': mark_tested(args.image)
    elif args.action == 'publish': publish(args.image)
    else: apply(args.image)

if __name__ == '__main__':
    try: main()
    except Exception as error:
        # Configuration, environment values and Azure response bodies stay private.
        print(str(error) if isinstance(error, AssertionError) else 'BUTTON_STATES_RELEASE_STOPPED', file=sys.stderr)
        sys.exit(1)
