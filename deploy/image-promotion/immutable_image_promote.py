"""Promote one attested image, retaining the existing ARM ownership/rollback guard.

This runner coordinator never builds an image or edits candidate source. Historical
bridge attestations remain byte-for-byte intact and are bound to this promotion.
"""
import base64, hashlib, importlib.util, json, os, re, subprocess, sys, time
import urllib.error, urllib.request
from pathlib import Path

SOURCE = '5f756d31cdbb2203ddc1ad8107b4f6fae7b6259f'
WEB = 'acrhidiprod0927.azurecr.io/hidi-web@sha256:506bdba05d969fe4aeb6176c22cca53d22b0eb653da70b306397dde41e014441'
API = 'acrhidiprod0927.azurecr.io/hidi-api@sha256:4d14ec2469e64f1b1478036d89a0305f938c06922145630f5ac5e71de3c69df3'
CONTROL = 'deploy/image-promotion/control.json'
BRANCH = 'migration/azure-sql-blob'
CHECKS = ['normalUpload','largeUpload','attachment','metadataUnchanged','collection','pdp','mobile','zoom','noOverflow','noBrokenImages','legacyProduct','cart','pricesUnchanged','checkout','paymentOptions','inventoryUnchanged']


def load_release():
    path = Path('deploy/photo-live/release.py').resolve()
    spec = importlib.util.spec_from_file_location('immutable_photo_release', path)
    result = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(result)
    return result


def github(path):
    request = urllib.request.Request('https://api.github.com/repos/HIDIfashions/HIDI-ecommerce/' + path, headers={'Authorization': 'Bearer ' + os.environ['GH_TOKEN'], 'Accept': 'application/vnd.github+json', 'Cache-Control': 'no-cache'})
    with urllib.request.urlopen(request, timeout=20) as response:
        return json.load(response)


def valid_control(value, run, coordinator):
    if value.get('runId') != run or value.get('coordinatorSha') != coordinator or value.get('sourceSha') != SOURCE:
        return None
    assert value.get('action') in ['wait', 'rollback', 'inspect', 'complete'], 'Invalid smoke control action'
    return value


def control():
    item = github('contents/' + CONTROL + '?ref=' + BRANCH)
    return valid_control(json.loads(base64.b64decode(item['content'])), os.environ['GITHUB_RUN_ID'], os.environ['GITHUB_SHA'])


def attest(r):
    assert r.source_sha() == SOURCE, 'Wrong candidate checkout'
    assert github('git/ref/heads/release/image-persistent-derivatives-20261023')['object']['sha'] == SOURCE
    root = Path('../bridge-evidence/evidence/photo-live')
    read = lambda name: json.loads((root / name).read_text())
    sealed = read('sealed.json')
    assert sealed['passed'] and sealed['photoSourceSha'] == SOURCE
    assert sealed['sourceSha'] == '3096b44f716dbcd090d5d22e6cbe87c975009eb4'
    for name, digest in sealed['manifest'].items():
        assert hashlib.sha256((root / name).read_bytes()).hexdigest() == digest, name
    images = read('published.json')['images']
    assert images == {'web': WEB, 'api': API}
    assert read('tests.json')['passed']
    storage = read('azure-storage-test.json')
    assert storage['passed'] and storage['image'] == WEB and storage['photoSourceSha'] == SOURCE
    assert storage['validationJobRemoved'] and storage['temporaryBlobFamilyDeleted']
    assert storage['databaseWrites'] == 0 and storage['productionTrafficChanged'] is False
    assert storage['persistentDerivativeCount'] == 7 and storage['sourceHashVerified']
    for run, sha in [(39900235407, SOURCE), (39902561056, '3096b44f716dbcd090d5d22e6cbe87c975009eb4'), (39908365165, 'e5834bea31881fed41eae4dbd93db7ac485b303a')]:
        status = github('actions/runs/' + str(run))
        assert status['status'] == 'completed' and status['conclusion'] == 'success' and status['head_sha'] == sha, run
    for app, image in images.items():
        subprocess.run(['docker', 'pull', image], check=True)
        assert r.r.guard.image_id(image) == sealed['images'][app]
    subprocess.run(['docker', 'run', '--rm', '--network', 'none', '--entrypoint', 'node', WEB, '--input-type=module', '-e', "import {createRequire} from 'node:module'; import {persistentDerivativeBlobKey} from '/app/product-images/images.mjs'; const r=createRequire('/app/apps/web/server.js'); if(!r('next/dist/server/image-optimizer.js').getSharp(1,false)||!r('/app/photo-stream/node_modules/@azure/storage-blob/sdk.cjs').BlobServiceClient||!r('/app/photo-stream/node_modules/@azure/identity/sdk.cjs').DefaultAzureCredential||!persistentDerivativeBlobKey('products/variants/test/test.jpg',640,'webp')) throw Error('Storage probe dependencies missing'); console.log('PASS: immutable image read-only inspection dependencies');"], check=True)
    r.save('promotion-attestation.json', {'passed': True, 'sourceSha': SOURCE, 'coordinatorSha': os.environ['GITHUB_SHA'], 'bridgeCoordinatorSha': sealed['sourceSha'], 'images': images, 'releaseImageRebuilt': False, 'originalSealSha256': hashlib.sha256((root / 'sealed.json').read_bytes()).hexdigest()})
    return read('before.json')


def recover(r):
    if not (r.P / 'web-forward.json').exists() or (r.E / 'promotion-complete.json').exists():
        return
    before = r.r.photo.states()
    captured = r.r.guard.private_json('public-before.json')
    marker = r.r.guard.private_json('web-forward.json')
    result = r.r.guard.reconcile_failure(WEB, before, captured, captured, 'imageimmutable' + r.r.guard.run_key('a'), bool(marker.get('mayComplete')))
    r.save('promotion-rollback.json', result)
    assert result['passed'] and result['webStatus'] in ['restored', 'original-retained'], 'Rollback has not restored the captured image'
    assert result['apiUnchanged'], 'API drift during rollback'
    for path in ['/health', '/healthz', '/api/store/health/ready', '/', '/cart', '/checkout']:
        r.r.cloud.get(path)
    print('ROLLBACK VERIFIED: previous image is healthy', flush=True)


def live_checks(r, full=False):
    deployed = r.read('promotion-live.json')['states']
    r.r.photo.unchanged(deployed)
    routes = ['/health', '/healthz', '/api/store/health/ready']
    if full:
        routes += ['/', '/collections/all', '/cart', '/checkout', '/account', '/api/store/checkout/payment-options']
    for path in routes:
        r.r.cloud.get(path)
    assert r.r.guard.public_snapshot() == r.r.guard.private_json('public-before.json'), 'Public configuration changed'
    assert json.loads(r.r.cloud.get('/api/hidi/offers')) == r.r.guard.private_json('offers-before.json'), 'Offers changed'
    for name, state in deployed.items():
        app = r.r.cloud.app(name)
        url = 'https://management.azure.com' + app['id'] + '/revisions/' + state['ready'] + '?api-version=2025-07-01'
        revision = r.r.cloud.azure('rest', '--method', 'get', '--url', url)['properties']
        assert revision.get('healthState') == 'Healthy', name + ': revision unhealthy'
        assert revision.get('runningState') == 'Running', name + ': revision not running'
    return True


def prepare_and_deploy(r, do_apply=True):
    r.r.fresh_source()
    expected = attest(r)
    observed = {name: r.r.cloud.snapshot(r.r.cloud.app(name)) for name in expected}
    assert observed == expected, 'STOP: production baseline changed since tested composition'
    r.capture()
    assert r.r.photo.states() == expected
    r.r.backups()
    assert API == expected['hidi-api']['image']
    # Capture fallback behaviour on this pre-existing source before promotion.
    old_source = '/media/products/variants/cmv508ble011s01z3rygu4as3/1791794828102-2020f682-53ea-42fb-b4d3-fce9959fcbe5.jpg?hidi_image=3'
    r.r.guard.write_private('legacy-source.json', old_source)
    from urllib.parse import urlencode
    sample = '/_next/image?' + urlencode({'url': old_source, 'w': 640, 'q': 75})
    old_bytes = r.r.cloud.get(sample, headers={'Accept': 'image/webp'})
    assert old_bytes[:4] == b'RIFF' and old_bytes[8:12] == b'WEBP'
    r.save('legacy-preflight.json', {'passed': True, 'source': old_source, 'sha256': hashlib.sha256(old_bytes).hexdigest()})
    r.r.fresh_source()
    r.r.photo.unchanged(expected)
    assert r.r.guard.public_snapshot() == r.r.guard.private_json('public-before.json')
    if not do_apply:
        r.save('promotion-prepared.json', {'passed': True, 'sourceSha': SOURCE, 'images': {'web': WEB, 'api': API}, 'baseline': expected, 'backupVerified': True, 'productionTrafficChanged': False, 'databaseWrites': 0, 'releaseImageRebuilt': False})
        print('PASS: promotion prepared, fresh rollback backups verified; deployment disabled', flush=True)
        return
    r.r.guard.install_interrupt_handler()
    r.r.guard.write_private('web-forward.json', {'attempted': False, 'mayComplete': False})
    suffix = 'imageimmutable' + r.r.guard.run_key('a')
    try:
        r.r.guard.conditional_write_image(r.r.photo.originals()['hidi-web'], WEB, suffix, 'web-forward.json')
        deployed = dict(expected)
        deployed['hidi-web'] = r.r.cloud.snapshot(r.r.guard.wait_ready(WEB, suffix, expected))
        r.save('promotion-live.json', {'states': deployed, 'sourceSha': SOURCE, 'coordinatorSha': os.environ['GITHUB_SHA'], 'runId': os.environ['GITHUB_RUN_ID'], 'passed': False})
        live_checks(r, full=True)
        for path in ['/api/admin/inventory', '/api/hidi/offers/admin', '/admin/offers']:
            r.r.cloud.get(path, 401)
        request = urllib.request.Request(r.r.cloud.BASE + '/api/admin/inventory/photo-probe/images', data=b'--photo-check--\r\n', headers={'Content-Type': 'multipart/form-data; boundary=photo-check'}, method='POST')
        try:
            urllib.request.urlopen(request, timeout=30)
            raise AssertionError('Anonymous upload unexpectedly accepted')
        except urllib.error.HTTPError as error:
            assert error.code == 401 and error.headers.get('x-hidi-photo-upload') == 'stream-v1'
        new_bytes = r.r.cloud.get(sample, headers={'Accept': 'image/webp'})
        assert new_bytes[:4] == b'RIFF' and new_bytes[8:12] == b'WEBP', 'Legacy image fallback failed'
        report = r.read('promotion-live.json')
        report.update({'passed': True, 'readyForManualSmoke': True, 'legacyFallbackPassed': True, 'anonymousUploadDenied': True, 'apiUnchanged': True, 'databaseWritesByCoordinator': 0})
        r.save('promotion-live.json', report)
        r.r.guard.write_private('smoke-deadline.json', {'deadline': time.time() + 3600})
        print('READY FOR MANUAL SMOKE: exact immutable image healthy; rollback armed for 60 minutes', flush=True)
    except BaseException:
        recover(r)
        raise


def monitor(r, until_storage=False):
    r.r.guard.install_interrupt_handler()
    deadline = r.r.guard.private_json('smoke-deadline.json')['deadline']
    last_health = 0
    inspection = None
    try:
        while time.time() < deadline:
            command = control()
            if command and command['action'] == 'rollback':
                raise AssertionError('Operator reported live smoke failure: ' + str(command.get('reason', 'unspecified'))[:200])
            if inspection is not None and inspection.poll() is not None:
                assert inspection.returncode == 0, 'Uploaded-photo storage inspection failed'
                inspection = None
                assert r.read('uploaded-photo-storage.json')['passed']
                if until_storage:
                    return
            if command and command['action'] == 'inspect' and inspection is None and not (r.E / 'uploaded-photo-storage.json').exists():
                path = r.P / 'uploaded-photo-input.json'
                path.write_text(json.dumps(command['photos'])); path.chmod(0o600)
                inspection = subprocess.Popen([sys.executable, str(Path(__file__).with_name('inspect_uploaded_photos.py')), str(path)])
            if time.monotonic() - last_health > 45:
                live_checks(r)
                last_health = time.monotonic()
                print('HEALTH PASS; manual smoke pending', flush=True)
            if command and command['action'] == 'complete':
                assert command.get('checks') == {name: 'PASS' for name in CHECKS}, 'All manual smoke checks must pass'
                assert (r.E / 'uploaded-photo-storage.json').exists(), 'Actual uploaded photo Azure evidence missing'
                storage = r.read('uploaded-photo-storage.json')
                assert storage['passed'] and storage['sourceSha'] == SOURCE and storage['image'] == WEB
                assert storage['normalAndLargeVerified'] and storage['validationJobRemoved']
                assert storage.get('persistedServingVerified') is True, 'Live persisted serving evidence required'
                live_checks(r, full=True)
                r.save('promotion-complete.json', {'passed': True, 'sourceSha': SOURCE, 'image': WEB, 'manualChecks': command['checks'], 'storage': storage, 'states': r.read('promotion-live.json')['states']})
                print('PASS: production smoke complete', flush=True)
                return
            time.sleep(10)
        raise AssertionError('Manual smoke deadline expired without complete evidence')
    except BaseException:
        if inspection is not None and inspection.poll() is None:
            inspection.terminate()
        try:
            recover(r)
        finally:
            if inspection is not None:
                inspection.wait(timeout=240)
        raise


def self_test():
    good = {'runId': '123', 'coordinatorSha': 'abc', 'sourceSha': SOURCE, 'action': 'rollback'}
    assert valid_control(good, '123', 'abc') == good
    for key in ['runId', 'coordinatorSha', 'sourceSha']:
        assert valid_control({**good, key: 'different'}, '123', 'abc') is None
    try:
        valid_control({**good, 'action': 'execute-arbitrary-command'}, '123', 'abc')
    except AssertionError:
        pass
    else:
        raise AssertionError('Unrecognized control action accepted')
    assert len(CHECKS) == len(set(CHECKS)) == 16
    print('PASS: smoke controls bind exact run, coordinator and candidate; unknown commands rejected')


if __name__ == '__main__':
    mode = sys.argv[1]
    if mode == 'self-test':
        self_test()
    else:
        r = load_release()
        {'prepare': lambda r: prepare_and_deploy(r, do_apply=False), 'deploy': prepare_and_deploy, 'inspect': lambda r: monitor(r, until_storage=True), 'monitor': monitor, 'recover': recover}[mode](r)
