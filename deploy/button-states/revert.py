"""Restore only the owned button overlay; API, SQL, Blob and settings stay read-only."""
import argparse
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import time

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
REGISTRY = 'acrhidiprod0927.azurecr.io'
OWNED_WEB = REGISTRY + '/hidi-web@sha256:00a3678d2b1158a89b034c4b525adf2cf08292fe379e2a52068dbcc038af0d6a'
TARGET_WEB = REGISTRY + '/hidi-web@sha256:a3a6f00f669d1768ab582d209cedc0c8e8b4fb82a656b9a380e6e46cf175d801'
TARGET_REVISION = 'hidi-web--admindeleteweb38054175040'
ASSETS = {'buttons.css', 'buttons.js', 'handler.mjs'}
THEME_FILES = {'server.mjs'} | {'button-states/' + name for name in ASSETS}
PROTECTED_FILES = ['apps/web/server.js', 'dist/index.html', 'admin-tools/handler.mjs', 'admin-tools/navigation.js', 'admin-tools/product-delete-handler.mjs', 'admin-tools/product-delete-storage.mjs', 'admin-tools/product-delete.html', 'admin-tools/product-delete.mjs', 'admin-tools/product-delete-links.js', 'hero-media.mjs', 'privacy-policy/handler.mjs']
EXPECTED_COVERAGE = {(engine, width, height) for engine in ['chromium', 'firefox', 'webkit'] for width, height in [(320, 568), (390, 844), (844, 390), (1440, 900)]}
SOURCE_BEFORE_THEME = 'c7e4e41866e8b89c6c0097d06574beff771c2d16'
SOURCE_FILES = ['apps/web/app/layout.tsx', 'apps/web/components/return-exchange-request.tsx', 'deploy/checkout-theme-probes.mjs', 'tests/checkout-theme.browser.mjs']

def load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module)
    return module

helpers = load('button_revert_images', ROOT / 'compose-msg91-images.py')
cloud = load('button_revert_cloud', ROOT / 'privacy-policy/rollout.py')
cloud.API_VERSION = '2025-07-01'
patcher = load('button_revert_patch', HERE / 'patch-runtime.py')
private = Path(os.environ.get('RUNNER_TEMP', '/tmp')) / 'hidi-button-states-revert-private'
evidence = Path('evidence/button-states-revert')

def save(name, value):
    evidence.mkdir(parents=True, exist_ok=True)
    (evidence / name).write_text(json.dumps(value, indent=2))

def verify_source():
    repo = ROOT.parent
    for name in SOURCE_FILES:
        original = subprocess.check_output(['git', 'show', SOURCE_BEFORE_THEME + ':' + name], cwd=repo)
        assert (repo / name).read_bytes() == original, 'RESTORED_SOURCE_CHANGED: ' + name
    for name in ['buttons.css', 'buttons.js']:
        assert not (repo / 'apps/web/public/button-states' / name).exists(), 'SOURCE_THEME_ASSET_REMAINED: ' + name
    layout = (repo / 'apps/web/app/layout.tsx').read_text()
    assert 'data-hidi-button-theme' not in layout and 'button-states' not in layout, 'SOURCE_THEME_HOOK_REMAINED'
    old_workflow = (repo / '.github/workflows/button-states-release.yml').read_text()
    assert re.search(r'^  workflow_dispatch:', old_workflow, re.MULTILINE) and not re.search(r'^  push:', old_workflow, re.MULTILINE), 'AUTOMATIC_THEME_REAPPLICATION_REMAINED'
    save('source-restored.json', {'passed': True, 'baselineCommit': SOURCE_BEFORE_THEME, 'restoredFiles': SOURCE_FILES, 'publicThemeAssetsRemoved': True, 'themeHookRemoved': True, 'automaticThemeReapplicationDisabled': True})
    print('Original source files restored exactly; public theme assets/hooks removed; automatic reapplication disabled')

def immutable(image, app='web'):
    assert re.fullmatch(re.escape(REGISTRY + '/hidi-' + app) + r'@sha256:[0-9a-f]{64}', image), 'IMMUTABLE_IMAGE_REQUIRED'

def originals():
    return {name: json.loads((private / (name + '.json')).read_text()) for name in ['hidi-web', 'hidi-api']}

def states():
    return {name: cloud.snapshot(data) for name, data in originals().items()}

def unchanged(expected):
    for name, state in expected.items():
        current = cloud.snapshot(cloud.app(name)); cloud.ready(current)
        assert current == state, 'CONCURRENT_APPLICATION_CHANGE: ' + name

def require_api(expected):
    state = cloud.snapshot(cloud.app('hidi-api')); cloud.ready(state)
    assert state == expected, 'API_STATE_CHANGED'

def public_state():
    result = {}
    for path in ['/api/hidi/hero-config', '/api/hidi/landing-media-config', '/api/hidi/privacy-policy', '/config.js']:
        raw = cloud.get(path)
        if path.startswith('/api/'): raw = json.dumps(json.loads(raw), sort_keys=True, separators=(',', ':')).encode()
        result[path] = hashlib.sha256(raw).hexdigest()
    return result

def capture():
    private.mkdir(parents=True, exist_ok=True); private.chmod(0o700)
    captured = {}
    for name in ['hidi-web', 'hidi-api']:
        data = cloud.app(name); state = cloud.snapshot(data); cloud.ready(state)
        immutable(state['image'], name.removeprefix('hidi-'))
        if name == 'hidi-web': assert state['image'] == OWNED_WEB, 'OWNED_BUTTON_IMAGE_CHANGED'
        target = private / (name + '.json'); target.write_text(json.dumps(data)); target.chmod(0o600)
        captured[name] = state
    historical = cloud.azure('containerapp', 'revision', 'show', '-g', cloud.GROUP, '-n', 'hidi-web', '--revision', TARGET_REVISION)
    containers = historical['properties']['template']['containers']
    assert historical['name'] == TARGET_REVISION and len(containers) == 1 and containers[0]['image'] == TARGET_WEB, 'PRETHEME_REVISION_IMAGE_MISMATCH'
    save('before.json', captured)
    save('target.json', {'image': TARGET_WEB, 'originalRevision': TARGET_REVISION, 'verified': True})
    save('public-before.json', public_state())
    unchanged(captured)
    with open(os.environ['GITHUB_ENV'], 'a') as output: output.write('WEB_IMAGE=' + TARGET_WEB + '\n')
    print('Ready owned web and current API captured; pretheme revision confirmed; no applications changed')

def backup():
    before = states(); unchanged(before)
    for name, state in before.items():
        unchanged(before)
        tag_name = 'backup-button-revert-' + os.environ['GITHUB_RUN_ID']
        tag = REGISTRY + '/' + name + ':' + tag_name
        for args in [('pull', state['image']), ('tag', state['image'], tag), ('push', tag)]: subprocess.run(['docker', *args], check=True)
        digest = subprocess.check_output(['az', 'acr', 'repository', 'show', '--name', 'acrhidiprod0927', '--image', name + ':' + tag_name, '--query', 'digest', '-o', 'tsv', '--only-show-errors'], text=True).strip()
        assert digest == state['image'].split('@', 1)[1], 'BACKUP_DIGEST_MISMATCH: ' + name
        save(name.removeprefix('hidi-') + '-backup.json', {'originalImage': state['image'], 'backupTag': tag, 'digest': digest, 'verified': True, 'settingsHash': state['settingsHash']})
    unchanged(before)
    print('Both fresh ready images independently backed up and verified; applications unchanged')

def require_backups(before):
    for name, state in before.items():
        path = evidence / (name.removeprefix('hidi-') + '-backup.json')
        assert path.is_file(), 'VERIFIED_BACKUP_REQUIRED: ' + name
        report = json.loads(path.read_text())
        assert report.get('verified') is True and report.get('originalImage') == state['image'] and report.get('settingsHash') == state['settingsHash'] and report.get('digest') == state['image'].split('@', 1)[1], 'VERIFIED_BACKUP_MISMATCH: ' + name

def verify(target, current, configs):
    first, last = helpers.fingerprints(target), helpers.fingerprints(current)
    changed = {name for name in first.keys() | last.keys() if first.get(name) != last.get(name)}
    assert changed == THEME_FILES, 'UNREVIEWED_WEB_FILES: ' + str(sorted(changed ^ THEME_FILES))
    assert all('button-states/' + name not in first for name in ASSETS), 'TARGET_ALREADY_HAS_BUTTON_OVERLAY'
    assert (current / 'server.mjs').read_text() == patcher.patch_runtime((target / 'server.mjs').read_text()), 'UNEXPECTED_RUNTIME_PATCH'
    for name in ASSETS:
        assert (current / 'button-states' / name).read_bytes() == (HERE / name).read_bytes(), 'UNEXPECTED_BUTTON_ASSET: ' + name
    for name in PROTECTED_FILES:
        assert name in first and first[name] == last[name], 'RETAINED_FEATURE_MISSING: ' + name
    old, new = configs
    assert old['Config'] == new['Config'], 'IMAGE_CONFIGURATION_CHANGED'
    layers = old['RootFS']['Layers']; current_layers = new['RootFS']['Layers']
    assert current_layers[:len(layers)] == layers and len(current_layers) == len(layers) + 1, 'BASE_IMAGE_LAYERS_CHANGED'
    return {'passed': True, 'changedFiles': sorted(changed), 'protectedFilesIdentical': len(first) - 1, 'compiledNextPreserved': True, 'landingHtmlPreserved': True, 'adminDeletionPreserved': True, 'runtimeConfigurationPreserved': True, 'baseLayersPreserved': True, 'apiModified': False}

def image_id(image):
    return json.loads(helpers.docker('image', 'inspect', image))[0]['Id']

def prepare():
    before = states(); assert before['hidi-web']['image'] == OWNED_WEB, 'OWNED_BUTTON_IMAGE_CHANGED'
    require_backups(before); unchanged(before)
    subprocess.run(['docker', 'pull', TARGET_WEB], check=True)
    folder = private / 'web'; folder.mkdir()
    target, current = folder / 'target-app', folder / 'current-app'
    helpers.extract(TARGET_WEB, target); helpers.extract(OWNED_WEB, current)
    configs = json.loads(helpers.docker('image', 'inspect', TARGET_WEB, OWNED_WEB))
    report = verify(target, current, configs)
    report.update({'currentImage': OWNED_WEB, 'targetImage': TARGET_WEB, 'targetImageId': configs[0]['Id'], 'currentImageId': configs[1]['Id']})
    save('web-preservation.json', report); unchanged(before)
    print('Exact inverse of four theme files verified; compiled storefront, Admin deletion and tabs identical')

def validate_browser_report(report):
    assert report.get('passed') is True and report.get('examinedControls', 0) > 0, 'CANDIDATE_REGRESSION_REQUIRED'
    assert report.get('sourceThemeInjected') is False and report.get('liveWrites') == 0, 'ACTUAL_CANDIDATE_WITHOUT_LIVE_WRITES_REQUIRED'
    assert report.get('results') and all(item.get('status') == 'PASS' for item in report['results']), 'CANDIDATE_REGRESSION_FAILURE'
    coverage = {(item.get('engine'), item.get('width'), item.get('height')) for item in report['results']}
    assert coverage == EXPECTED_COVERAGE, 'CANDIDATE_BROWSER_COVERAGE_INCOMPLETE'

def mark_tested():
    preserved = json.loads((evidence / 'web-preservation.json').read_text())
    assert preserved.get('passed') is True and preserved.get('targetImage') == TARGET_WEB and preserved.get('targetImageId') == image_id(TARGET_WEB), 'TESTED_TARGET_CHANGED'
    target = evidence / 'candidate/report.json'; validate_browser_report(json.loads(target.read_text()))
    save('candidate-regression.json', {'passed': True, 'targetImage': TARGET_WEB, 'targetImageId': preserved['targetImageId'], 'sourceSha': os.environ['GITHUB_SHA'], 'reportSha256': hashlib.sha256(target.read_bytes()).hexdigest(), 'browserEngines': ['chromium', 'firefox', 'webkit'], 'viewportCount': 4, 'realCommerceWrites': False})
    unchanged(states())
    print('Exact existing immutable target passed candidate storefront and Admin regression gates')

def require_candidate(before):
    preserved = json.loads((evidence / 'web-preservation.json').read_text())
    tested = json.loads((evidence / 'candidate-regression.json').read_text())
    assert preserved.get('passed') is True and preserved.get('currentImage') == before['hidi-web']['image'] == OWNED_WEB and preserved.get('targetImage') == TARGET_WEB and set(preserved.get('changedFiles', [])) == THEME_FILES, 'PRESERVED_BASE_MISMATCH'
    assert tested.get('passed') is True and tested.get('targetImage') == TARGET_WEB and tested.get('targetImageId') == preserved.get('targetImageId') == image_id(TARGET_WEB), 'TESTED_IMMUTABLE_TARGET_REQUIRED'
    assert tested.get('sourceSha') == os.environ['GITHUB_SHA'], 'CANDIDATE_SOURCE_MISMATCH'
    target = evidence / 'candidate/report.json'
    assert tested.get('reportSha256') == hashlib.sha256(target.read_bytes()).hexdigest(), 'TESTED_REPORT_CHANGED'
    validate_browser_report(json.loads(target.read_text()))

def wait_ready(image, suffix, api):
    for attempt in range(60):
        require_api(api)
        data = cloud.app('hidi-web'); state = cloud.snapshot(data)
        if state['image'] == image and state['latest'] == state['ready'] == 'hidi-web--' + suffix:
            cloud.ready(state); return data
        time.sleep(10)
    raise RuntimeError('WEB_REVISION_NOT_READY')

def verify_live_routes():
    target = private / 'web/target-app'
    for path in ['/health', '/healthz', '/api/store/health/ready', '/', '/collections/all', '/cart', '/checkout', '/account', '/wishlist', '/shipping', '/returns', '/admin', '/admin/products', '/admin/products/price-tags', '/admin/landing-media', '/admin/packing-scanner', '/admin/product-quick-fill', '/admin/product-bulk', '/admin/product-delete', '/admin/privacy-policy']:
        body = cloud.get(path)
        assert b'data-hidi-button-theme=' not in body and b'data-hidi-button-states=' not in body and b'/button-states/buttons.' not in body, 'LIVE_BUTTON_HOOK_REMAINED: ' + path
    for name in ['navigation.js', 'product-delete.mjs', 'product-delete-links.js']:
        assert cloud.get('/admin-tools-assets/' + name) == (target / 'admin-tools' / name).read_bytes(), 'LIVE_ADMIN_ASSET_CHANGED: ' + name
    for path in ['/api/admin/products/options', '/api/admin/orders?status=CONFIRMED', '/api/hidi/privacy-policy/admin', '/api/hidi/product-deletion/nonexistent-button-revert-fixture']:
        cloud.get(path, 401)

def apply():
    old = originals(); before = {name: cloud.snapshot(data) for name, data in old.items()}
    require_backups(before); require_candidate(before); unchanged(before)
    public = json.loads((evidence / 'public-before.json').read_text())
    assert public_state() == public, 'PROTECTED_PUBLIC_CONTENT_CHANGED_BEFORE_APPLY'
    owned = False; run = os.environ['GITHUB_RUN_ID']; suffix = 'buttonrevert' + run
    try:
        unchanged(before); owned = True
        cloud.write_image(old['hidi-web'], TARGET_WEB, suffix)
        current = cloud.snapshot(wait_ready(TARGET_WEB, suffix, before['hidi-api']))
        assert current['settingsHash'] == before['hidi-web']['settingsHash'], 'WEB_SETTINGS_CHANGED'
        require_api(before['hidi-api']); verify_live_routes()
        subprocess.run(['node', str(HERE / 'revert-probes.mjs'), cloud.BASE, str(evidence / 'live')], check=True, timeout=900)
        validate_browser_report(json.loads((evidence / 'live/report.json').read_text()))
        require_api(before['hidi-api']); assert public_state() == public, 'PROTECTED_PUBLIC_CONTENT_CHANGED'
        after = {name: cloud.snapshot(cloud.app(name)) for name in before}
        assert after['hidi-api'] == before['hidi-api'], 'API_STATE_CHANGED'
        assert after['hidi-web']['image'] == TARGET_WEB and after['hidi-web']['latest'] == 'hidi-web--' + suffix and after['hidi-web']['settingsHash'] == before['hidi-web']['settingsHash'], 'WEB_STATE_CHANGED'
        cloud.ready(after['hidi-web'])
        save('after.json', {'states': after, 'buttonThemeRemoved': True, 'apiUnchanged': True, 'webSettingsPreserved': True, 'publicContentPreserved': True, 'compiledNextPreserved': True, 'adminDeletionPreserved': True, 'adminTabsPreserved': True, 'databaseWrites': False, 'blobWrites': False})
        print('PASS: only button theme reverted; API, functionality, compiled storefront and Admin retained')
    except Exception:
        status = 'not-owned'; failure = False
        try:
            data = cloud.app('hidi-web'); current = cloud.snapshot(data)
            if owned and current['image'] == TARGET_WEB and current['latest'] == 'hidi-web--' + suffix and current['settingsHash'] == before['hidi-web']['settingsHash']:
                rollback = 'buttonrevertrb' + run
                cloud.write_image(data, before['hidi-web']['image'], rollback)
                cloud.wait_ready(before['hidi-web']['image'], rollback); status = 'restored'
            elif current == before['hidi-web']:
                status = 'original-image-retained'
        except Exception:
            failure = True; status = 'restore-failed'
        api_unchanged = False
        try: api_unchanged = cloud.snapshot(cloud.app('hidi-api')) == before['hidi-api']
        except Exception: pass
        save('rollback.json', {'webStatus': status, 'rollbackFailed': failure, 'apiUnchanged': api_unchanged, 'apiWrites': False, 'databaseWrites': False, 'blobWrites': False})
        raise

def main():
    parser = argparse.ArgumentParser(); parser.add_argument('action', choices=['verify-source', 'capture', 'backup', 'prepare', 'mark-tested', 'apply'])
    action = parser.parse_args().action
    {'verify-source': verify_source, 'capture': capture, 'backup': backup, 'prepare': prepare, 'mark-tested': mark_tested, 'apply': apply}[action]()

if __name__ == '__main__':
    try: main()
    except Exception as error:
        print(str(error) if isinstance(error, AssertionError) else 'BUTTON_ONLY_REVERT_STOPPED', file=sys.stderr)
        sys.exit(1)
