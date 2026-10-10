"""Guarded web-image-only rollout; no API, database, secrets or app settings writes."""
import copy
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import time
import urllib.error
import urllib.request

GROUP = 'rg-hidi-prod'
BASE = 'https://thidigk.thehidi.com'
API_VERSION = '2024-03-01'

class AzureOperationError(RuntimeError):
    pass

def azure(*args):
    result = subprocess.run(['az', *args, '--only-show-errors', '-o', 'json'], capture_output=True, text=True, timeout=180)
    if result.returncode:
        code = 'unclassified'
        for match in re.finditer(r'\{', result.stderr):
            try:
                error = json.JSONDecoder().raw_decode(result.stderr[match.start():])[0].get('error', {})
                candidate = error.get('code')
                if isinstance(candidate, str) and re.fullmatch(r'[A-Za-z0-9_.-]{1,100}', candidate): code = candidate; break
            except (ValueError, AttributeError): pass
        raise AzureOperationError('Azure operation rejected: ' + code)
    return json.loads(result.stdout or '{}')

def app(name):
    return azure('containerapp', 'show', '-g', GROUP, '-n', name)

def snapshot(data):
    properties = data['properties']
    value = copy.deepcopy(data)
    template = value['properties']['template']; template.pop('revisionSuffix', None)
    assert len(template['containers']) == 1
    image = template['containers'][0].pop('image')
    template['containers'][0]['env'] = sorted(template['containers'][0].get('env', []), key=lambda item: item['name'])
    # Azure CLI may serialize an absent value as empty on retained secretRefs.
    # The name and exact reference must still match; all real values are hashed.
    for item in template['containers'][0]['env']:
        if item.get('secretRef') and item.get('value') in (None, ''): item.pop('value', None)
    configuration = value['properties']['configuration']; configuration.get('ingress', {}).pop('traffic', None)
    protected = {'template': template, 'configuration': configuration, 'identity': value.get('identity'), 'tags': value.get('tags'), 'location': value.get('location'), 'environmentId': properties.get('environmentId'), 'managedEnvironmentId': properties.get('managedEnvironmentId'), 'workloadProfileName': properties.get('workloadProfileName')}
    return {'image': image, 'settingsHash': hashlib.sha256(json.dumps(protected, sort_keys=True).encode()).hexdigest(), 'latest': properties['latestRevisionName'], 'ready': properties.get('latestReadyRevisionName'), 'mode': properties['configuration']['activeRevisionsMode']}

def ready(state):
    assert state['mode'] == 'Single' and state['latest'] == state['ready'] and state['ready'], 'Application is not ready'

def image_patch(data, image, suffix):
    # JSON Merge Patch leaves scale, volumes and other template settings intact.
    # The complete container list retains its env/resources/probes byte values.
    template = {'containers': copy.deepcopy(data['properties']['template']['containers'])}
    template['containers'][0]['image'] = image; template['revisionSuffix'] = suffix
    return {'location': data['location'], 'properties': {'template': template}}

def write_image(data, image, suffix):
    path = Path(os.environ['RUNNER_TEMP']) / 'privacy-policy-image-patch.json'
    path.write_text(json.dumps(image_patch(data, image, suffix))); path.chmod(0o600)
    try: azure('rest', '--method', 'patch', '--url', 'https://management.azure.com' + data['id'] + '?api-version=' + API_VERSION, '--body', '@' + str(path))
    finally: path.unlink(missing_ok=True)

def wait_ready(image, suffix):
    for attempt in range(60):
        data = app('hidi-web'); state = snapshot(data)
        if state['image'] == image and state['latest'] == state['ready'] and state['ready'] == 'hidi-web--' + suffix: return data
        time.sleep(10)
    raise RuntimeError('Web revision did not become ready')

def get(path, expected=200, headers=None):
    try:
        with urllib.request.urlopen(urllib.request.Request(BASE + path, headers=headers or {}), timeout=30) as response:
            status = response.status; body = response.read(3 * 1024 * 1024)
    except urllib.error.HTTPError as error:
        status = error.code; body = error.read(65536)
    assert status == expected, 'Unexpected HTTP status for ' + path + ': ' + str(status)
    return body

def main():
    work = Path(os.environ['RUNNER_TEMP']) / 'privacy-policy-private'; work.mkdir(exist_ok=True); work.chmod(0o700)
    evidence = Path('evidence'); evidence.mkdir(exist_ok=True)
    if sys.argv[1] == 'capture':
        states = {}
        for name in ['hidi-web', 'hidi-api']:
            data = app(name); state = snapshot(data); ready(state)
            assert re.fullmatch(r'acrhidiprod0927\.azurecr\.io/hidi-(web|api)@sha256:[0-9a-f]{64}', state['image'])
            file = work / (name + '.json'); file.write_text(json.dumps(data)); file.chmod(0o600)
            states[name] = state
        with open(os.environ['GITHUB_ENV'], 'a') as output: output.write('EXPECTED_WEB=' + states['hidi-web']['image'] + '\n')
        (evidence / 'privacy-before.json').write_text(json.dumps(states, indent=2))
        print('Ready immutable live images captured; private app settings retained for comparison')
        return
    candidate = sys.argv[2]
    assert re.fullmatch(r'acrhidiprod0927\.azurecr\.io/hidi-web@sha256:[0-9a-f]{64}', candidate)
    old = {name: json.loads((work / (name + '.json')).read_text()) for name in ['hidi-web', 'hidi-api']}
    baseline = {name: snapshot(value) for name, value in old.items()}
    for name in old: assert snapshot(app(name)) == baseline[name], 'Live release changed during candidate preparation'
    changed = False
    try:
        changed = True
        suffix = 'privacy' + os.environ['GITHUB_RUN_ID']
        write_image(old['hidi-web'], candidate, suffix)
        current = snapshot(wait_ready(candidate, suffix))
        assert current['image'] == candidate and current['settingsHash'] == baseline['hidi-web']['settingsHash'], 'Protected web configuration changed'
        get('/health'); get('/'); get('/api/store/health/ready')
        assert json.loads(get('/api/hidi/privacy-policy')) == {'published': False}, 'Draft must remain unpublished'
        try:
            urllib.request.urlopen('https://sthidiprod0927.blob.core.windows.net/hidi-private-policies/state.json', timeout=20).close()
            raise AssertionError('Private draft must not be accessible anonymously from Blob Storage')
        except urllib.error.HTTPError as error:
            assert error.code in (401, 403, 404), 'Unexpected private storage response'
        assert b'No published privacy policy' in get('/privacy', 404)
        assert b'Business correspondence address' in get('/admin/privacy-policy')
        get('/api/hidi/privacy-policy/admin', 401)
        get('/api/hidi/privacy-policy/admin/preview', 401)
        get('/api/hidi/privacy-policy/admin', 401, {'Cookie': 'hidi_admin_access=invalid-privacy-probe'})
        for path in ['/account', '/cart', '/collections/all', '/admin/landing-media', '/admin/packing-scanner']:
            get(path)
        after = {name: snapshot(app(name)) for name in old}
        assert after['hidi-api'] == baseline['hidi-api'], 'API changed independently'
        assert after['hidi-web']['image'] == candidate and after['hidi-web']['settingsHash'] == baseline['hidi-web']['settingsHash']
        ready(after['hidi-web'])
        (evidence / 'privacy-after.json').write_text(json.dumps({'states': after, 'draftUnpublished': True, 'anonymousDenied': True, 'privateDraftSeeded': True, 'appSettingsPreserved': True}, indent=2))
        print('Policy editor deployed; private draft persisted; publication remains disabled pending owner review')
    except Exception:
        if changed:
            current_data = app('hidi-web'); current = snapshot(current_data)
            if current['image'] == candidate and current['settingsHash'] == baseline['hidi-web']['settingsHash']:
                suffix = 'privacyrollback' + os.environ['GITHUB_RUN_ID']
                write_image(current_data, baseline['hidi-web']['image'], suffix); wait_ready(baseline['hidi-web']['image'], suffix)
                print('Release validation failed; the owned web image was rolled back', file=sys.stderr)
            elif current['image'] == baseline['hidi-web']['image'] and current['settingsHash'] == baseline['hidi-web']['settingsHash']:
                print('Original web image and settings remain active; no rollback needed', file=sys.stderr)
            else: print('Live state changed independently; refusing to overwrite it', file=sys.stderr)
        raise

if __name__ == '__main__':
    try: main()
    except Exception as error:
        # State values and Azure stderr remain private. Invariants contain no secrets.
        print(str(error) if isinstance(error, (AssertionError, AzureOperationError)) else 'Privacy rollout stopped; inspect sanitized release evidence', file=sys.stderr)
        sys.exit(1)
