"""Inspect and repair the existing product-photo upload environment without rebuilding."""
import argparse
import copy
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import pty
import re
import select
import subprocess
import time
from urllib.parse import urlsplit

HERE = Path(__file__).resolve().parent
PRIVATE = Path(os.environ.get('RUNNER_TEMP', '/tmp')) / 'hidi-media-upload-private'
EVIDENCE = Path('evidence/media-upload-config')
MARKER = 'HIDI_MEDIA_CHECK'


def load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


cloud = load('media_config_cloud', HERE.parent / 'privacy-policy/rollout.py')
cloud.API_VERSION = '2025-07-01'
console = load('media_config_console', HERE.parent / 'product-skn/schema-check.py')


def save(name, value):
    EVIDENCE.mkdir(parents=True, exist_ok=True)
    (EVIDENCE / name).write_text(json.dumps(value, indent=2) + '\n')


def env(data):
    return {item['name']: item for item in data['properties']['template']['containers'][0].get('env', [])}


def capture():
    PRIVATE.mkdir(parents=True, exist_ok=True)
    PRIVATE.chmod(0o700)
    captured = {}
    for name in ('hidi-web', 'hidi-api'):
        data = cloud.app(name)
        state = cloud.snapshot(data)
        cloud.ready(state)
        assert re.fullmatch(r'acrhidiprod0927\.azurecr\.io/' + name + r'@sha256:[a-f0-9]{64}', state['image']), 'Immutable active image required'
        path = PRIVATE / (name + '.json')
        path.write_text(json.dumps(data))
        path.chmod(0o600)
        captured[name] = data
    save('before.json', {name: cloud.snapshot(data) for name, data in captured.items()})
    return captured


def unchanged(captured):
    for name, data in captured.items():
        assert cloud.snapshot(cloud.app(name)) == cloud.snapshot(data), 'Concurrent application change: ' + name


def runtime_probe(data, payload=None):
    account = env(data).get('AZURE_STORAGE_ACCOUNT', {}).get('value', '')
    assert re.fullmatch(r'[a-z0-9]{3,24}', account), 'Captured storage account must be explicit and valid'
    command = console.console_command((HERE / 'probe.mjs').read_text(), account, 'run', payload).replace('HIDI_SKN_SCHEMA', MARKER)
    master, slave = pty.openpty()
    process = subprocess.Popen(['az', 'containerapp', 'exec', '-g', cloud.GROUP, '-n', 'hidi-web',
        '--revision', data['properties']['latestReadyRevisionName'],
        '--container', data['properties']['template']['containers'][0]['name'],
        '--command', '/bin/sh', '--only-show-errors'],
        stdin=slave, stdout=slave, stderr=slave, start_new_session=True)
    os.close(slave)
    os.set_blocking(master, False)
    output, pending, sent = b'', b'', False
    try:
        deadline = time.monotonic() + 150
        while time.monotonic() < deadline:
            readable, writable, _ = select.select([master], [master] if pending else [], [], 1)
            if writable:
                try: pending = pending[os.write(master, pending[:2048]):]
                except BlockingIOError: pass
            if readable:
                try: chunk = os.read(master, 65536)
                except BlockingIOError: continue
                except OSError: break
                if not chunk: break
                output += chunk
                assert len(output) < 512 * 1024, 'Private console output limit'
                plain = console.terminal_text(output.decode(errors='replace'))
                if not sent and re.search(r'(?:^|[\r\n])[^\r\n]{0,160}[#$] $', plain):
                    pending, sent = command.encode(), True
                if console.complete_marker(plain, MARKER) or console.complete_marker(plain, MARKER + '_FAILED'): break
            if process.poll() is not None: break
        plain = console.terminal_text(output.decode(errors='replace'))
        report = console.complete_marker(plain, MARKER)
        if not report:
            code = (console.complete_marker(plain, MARKER + '_FAILED') or {}).get('failureCode', 'PRIVATE_MEDIA_CHECK_INCOMPLETE')
            assert isinstance(code, str) and re.fullmatch(r'[A-Z][A-Z0-9_]{0,79}', code), 'Invalid bounded failure code'
            raise AssertionError(code)
        assert report.get('passed') is True and report.get('databaseWrites') is False, 'Media probe scope differs'
        if payload and payload.get('mode') == 'uploadProbe':
            assert report.get('readOnly') is False and report.get('blobWrites') is True and report.get('ownedProbeCleaned') is True and report.get('publicReadMatches') is True and report.get('existingObjectsChanged') is False, 'Owned upload/read/cleanup proof required'
        else:
            assert report.get('readOnly') is True and report.get('blobWrites') is False, 'Read-only probe scope differs'
        return report
    finally:
        os.close(master)
        if process.poll() is None:
            process.terminate()
            try: process.wait(timeout=10)
            except subprocess.TimeoutExpired: process.kill(); process.wait(timeout=10)


def inspect():
    captured = capture()
    report = runtime_probe(captured['hidi-web'])
    unchanged(captured)
    report['liveApplicationsUnchanged'] = True
    save('runtime-inspection.json', report)
    print(json.dumps(report))


def prepare_change(data, runtime):
    assert runtime.get('readOnly') is True and runtime.get('databaseWrites') is False, 'Read-only inspection required'
    assert all(runtime.get(field) is True for field in ('mediaProviderAzure', 'accountConfigured', 'accountMatchesCapture', 'productContainerAccessible')), 'Existing Azure product-media access must be verified'
    items = data['properties']['template']['containers'][0].get('env', [])
    assert len({item['name'] for item in items}) == len(items), 'Duplicate environment names require review'
    origin = runtime.get('siteUrl')
    assert isinstance(origin, str), 'Existing public site URL required'
    url = urlsplit(origin)
    assert url.scheme == 'https' and not url.username and not url.password and not url.query and not url.fragment and not url.port and url.path in ('', '/'), 'Existing site must be an HTTPS origin'
    ingress = data['properties']['configuration']['ingress']
    bound = {item['name'].lower() for item in ingress.get('customDomains', []) if item.get('bindingType') == 'SniEnabled'}
    assert url.hostname in bound or url.hostname == ingress.get('fqdn'), 'Media URL must use an existing HTTPS app binding'
    assert env(data).get('SITE_URL', {}).get('value', '').rstrip('/') == origin.rstrip('/'), 'Runtime site differs from fresh app capture'
    target = origin.rstrip('/') + '/media'
    previous = env(data).get('MEDIA_PUBLIC_BASE_URL')
    if runtime.get('mediaBaseStartsHttps') is True:
        assert runtime.get('mediaBaseSafeUrl') == target, 'Already valid media URL differs; review before overriding'
    result = copy.deepcopy(data)
    values = result['properties']['template']['containers'][0].setdefault('env', [])
    replacement = {'name': 'MEDIA_PUBLIC_BASE_URL', 'value': target}
    for index, item in enumerate(values):
        if item['name'] == 'MEDIA_PUBLIC_BASE_URL': values[index] = replacement; break
    else: values.append(replacement)
    # Independent preservation check includes image, secrets/references, probes,
    # scale, volumes, domain bindings, identities and all other env values.
    preserved = copy.deepcopy(result)
    original_values = data['properties']['template']['containers'][0].get('env', [])
    preserved['properties']['template']['containers'][0]['env'] = copy.deepcopy(original_values)
    assert preserved == data, 'Change exceeds the single media environment setting'
    return result, target, previous


def backup(captured):
    unchanged(captured)
    run = os.environ['GITHUB_RUN_ID']
    assert re.fullmatch(r'\d+', run), 'Numeric workflow run required'
    for name, data in captured.items():
        state = cloud.snapshot(data)
        tag = 'acrhidiprod0927.azurecr.io/' + name + ':backup-media-config-' + run
        for args in (('pull', state['image']), ('tag', state['image'], tag), ('push', tag)):
            subprocess.run(['docker', *args], check=True)
        digest = cloud.azure('acr', 'repository', 'show', '--name', 'acrhidiprod0927', '--image', name + ':backup-media-config-' + run)['digest']
        assert digest == state['image'].split('@', 1)[1], 'Rollback image backup digest differs'
        save(name + '-backup.json', {'verified': True, 'image': tag, 'digest': digest,
            'settingsHash': state['settingsHash'], 'retainedRevision': state['ready']})
    unchanged(captured)


def published_content():
    return {path: hashlib.sha256(json.dumps(json.loads(cloud.get(path)), sort_keys=True).encode()).hexdigest()
        for path in ('/api/hidi/hero-config', '/api/hidi/landing-media-config', '/api/hidi/privacy-policy')}


def wait_ready(expected, suffix, baseline=None):
    deadline = time.monotonic() + 300
    while time.monotonic() < deadline:
        data = cloud.app('hidi-web')
        state = cloud.snapshot(data)
        if baseline is not None and state == baseline:
            time.sleep(5)
            continue
        assert state['image'] == expected['image'] and state['settingsHash'] == expected['settingsHash'], 'Independent web change while waiting'
        assert state['latest'] in {expected['latest'], 'hidi-web--' + suffix}, 'Independent web revision while waiting'
        if state['latest'] == state['ready'] == 'hidi-web--' + suffix: return data
        time.sleep(5)
    raise AssertionError('Media configuration revision did not become ready')


def rollback_if_owned(captured, expected, suffix):
    data = cloud.app('hidi-web')
    current = cloud.snapshot(data)
    old = cloud.snapshot(captured['hidi-web'])
    if current == old: return 'original-retained'
    if current['image'] == expected['image'] and current['settingsHash'] == expected['settingsHash'] and current['latest'] == 'hidi-web--' + suffix:
        rollback_suffix = 'mediaconfigrollback' + os.environ['GITHUB_RUN_ID']
        cloud.write_image(captured['hidi-web'], old['image'], rollback_suffix)
        wait_ready(old, rollback_suffix, current)
        return 'owned-setting-restored'
    return 'independent-change-not-overwritten'


def repair():
    captured = capture()
    runtime = runtime_probe(captured['hidi-web'])
    save('runtime-before.json', runtime)
    changed, target, previous = prepare_change(captured['hidi-web'], runtime)
    expected = cloud.snapshot(changed)
    backup(captured)
    content = published_content()
    # Prove the existing managed identity can write and the same app can serve
    # its exact bytes, removing only the owned disposable PNG afterwards.
    probe = runtime_probe(captured['hidi-web'], {'mode': 'uploadProbe', 'baseUrl': target, 'runId': os.environ['GITHUB_RUN_ID']})
    save('upload-before.json', probe)
    unchanged(captured)
    assert published_content() == content, 'Published content changed independently'
    save('configuration-backup.json', {'privateCaptureSaved': True,
        'retainedRevision': cloud.snapshot(captured['hidi-web'])['ready'],
        'previousSettingHash': hashlib.sha256(json.dumps(previous, sort_keys=True).encode()).hexdigest(),
        'changedSetting': 'MEDIA_PUBLIC_BASE_URL', 'target': target})
    suffix = 'mediaconfig' + os.environ['GITHUB_RUN_ID']
    wrote = False
    try:
        if expected['settingsHash'] != cloud.snapshot(captured['hidi-web'])['settingsHash']:
            wrote = True
            cloud.write_image(changed, expected['image'], suffix)
            current = wait_ready(expected, suffix, cloud.snapshot(captured['hidi-web']))
        else: current = captured['hidi-web']
        after = runtime_probe(current)
        assert after.get('mediaBaseStartsHttps') is True and after.get('mediaBaseSafeUrl') == target and after.get('productContainerAccessible') is True, 'Live upload environment is not repaired'
        save('runtime-after.json', after)
        save('upload-after.json', runtime_probe(current, {'mode': 'uploadProbe', 'baseUrl': target, 'runId': os.environ['GITHUB_RUN_ID']}))
        for route in ('/health', '/healthz', '/api/store/health/ready', '/', '/collections/all', '/cart', '/checkout', '/account', '/admin', '/admin/import', '/admin/products', '/admin/inventory/receive', '/admin/products/price-tags', '/admin/landing-media', '/admin/packing-scanner', '/admin/product-quick-fill', '/admin/product-bulk', '/admin/product-delete', '/admin/privacy-policy'):
            cloud.get(route)
        for route in ('/api/admin/products/options', '/api/admin/orders?status=CONFIRMED', '/api/hidi/privacy-policy/admin'):
            cloud.get(route, 401)
        assert published_content() == content, 'Published hero/media/privacy contents changed'
        assert cloud.snapshot(cloud.app('hidi-api')) == cloud.snapshot(captured['hidi-api']), 'API changed independently'
        assert cloud.snapshot(cloud.app('hidi-web')) == cloud.snapshot(current), 'Web changed independently after verification'
        save('after.json', {'passed': True, 'changedSetting': 'MEDIA_PUBLIC_BASE_URL', 'publicMediaBaseUrl': target,
            'imageUnchanged': cloud.snapshot(current)['image'] == cloud.snapshot(captured['hidi-web'])['image'],
            'allOtherSettingsPreserved': True, 'apiUnchanged': True, 'publishedContentPreserved': True,
            'actualManagedIdentityUploadVerified': True, 'publicImageBytesVerified': True,
            'probeObjectsCleaned': True, 'databaseWrites': False, 'productRowsModified': False,
            'after': cloud.snapshot(current)})
        print('PASS: product photo media URL repaired; actual upload/read/cleanup and retained routes verified')
    except Exception:
        if wrote: save('rollback.json', {'result': rollback_if_owned(captured, expected, suffix)})
        raise


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('action', choices=['inspect', 'repair'])
    args = parser.parse_args()
    try: globals()[args.action]()
    except Exception as error:
        print(str(error) if isinstance(error, AssertionError) else 'MEDIA_CONFIGURATION_OPERATION_FAILED')
        raise SystemExit(1)
