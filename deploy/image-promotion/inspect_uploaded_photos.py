"""Read-only verification of explicitly supplied uploaded photos using existing MI.
Creates/removes only an owned temporary Container Apps Job; never edits Blob data.
"""
import hashlib, json, os, re, signal, subprocess, sys, time
from pathlib import Path
from urllib.parse import urlencode
import urllib.request
from immutable_image_promote import load_release, SOURCE, WEB

PROBE = r'''
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {persistentDerivativeBlobKey} from '/app/product-images/images.mjs';
const require=createRequire('/app/apps/web/server.js');
const sharp=require('next/dist/server/image-optimizer.js').getSharp(1,false);
const {BlobServiceClient}=require('/app/photo-stream/node_modules/@azure/storage-blob/sdk.cjs');
const {DefaultAzureCredential}=require('/app/photo-stream/node_modules/@azure/identity/sdk.cjs');
const photos=JSON.parse(process.env.HIDI_SMOKE_PHOTOS);
const container=new BlobServiceClient('https://'+process.env.AZURE_STORAGE_ACCOUNT+'.blob.core.windows.net',new DefaultAzureCredential()).getContainerClient('product-media');
const widths=[384,640,750,828,1080,1200,1920];
const results=[];
for(const photo of photos){
  if(!/^products\/variants\/[a-zA-Z0-9_-]+\/[a-zA-Z0-9_.-]+$/.test(photo.key)||!Number.isSafeInteger(photo.bytes)||photo.bytes<1||!/^[a-f0-9]{64}$/.test(photo.sha256))throw Error('Invalid explicit photo identity');
  const blob=container.getBlockBlobClient(photo.key);
  const props=await blob.getProperties();
  const original=await blob.download();let bytes=0;const hash=createHash('sha256');
  for await(const chunk of original.readableStreamBody){bytes+=chunk.length;hash.update(chunk);}
  if(bytes!==photo.bytes||props.contentLength!==bytes||hash.digest('hex')!==photo.sha256)throw Error('Original bytes differ');
  const derivatives=[];
  for(const width of widths){
    const key=persistentDerivativeBlobKey(photo.key,width,'webp');
    if(!key)throw Error('Invalid derivative key');
    const derivative=container.getBlockBlobClient(key);
    const properties=await derivative.getProperties();const metadata=properties.metadata||{};
    if(properties.contentType!=='image/webp'||metadata.hidi_source_sha256!==photo.sha256||metadata.hidi_derivative_version!=='v1'||metadata.hidi_width!==String(width)||metadata.hidi_format!=='webp'||!/^[a-f0-9]{64}$/.test(metadata.hidi_derivative_sha256||''))throw Error('Derivative metadata differs: '+width);
    const response=await derivative.download();const chunks=[];let size=0;const digest=createHash('sha256');
    for await(const chunk of response.readableStreamBody){chunks.push(chunk);size+=chunk.length;digest.update(chunk);}
    if(!size||size!==properties.contentLength||digest.digest('hex')!==metadata.hidi_derivative_sha256)throw Error('Derivative bytes differ: '+width);
    const decoded=await sharp(Buffer.concat(chunks,size)).metadata();
    if(decoded.format!=='webp'||decoded.width!==width||!decoded.height)throw Error('Derivative image invalid: '+width);
    derivatives.push({width,bytes:size,sha256:metadata.hidi_derivative_sha256});
  }
  if((await blob.getProperties()).etag!==props.etag)throw Error('Original changed while being checked');
  results.push({key:photo.key,bytes,sha256:photo.sha256,originalUnchanged:true,derivatives});
}
console.log('HIDI_UPLOADED_PHOTOS '+JSON.stringify({passed:true,results,blobWrites:0,databaseWrites:0}));
'''


def validate_photos(photos):
    assert isinstance(photos, list) and len(photos) == 2, 'Exactly normal and large uploads required'
    for photo in photos:
        assert re.fullmatch(r'products/variants/[a-zA-Z0-9_-]+/[a-zA-Z0-9_.-]+', photo['key'])
        assert re.fullmatch(r'[a-f0-9]{64}', photo['sha256'])
        assert isinstance(photo['bytes'], int) and 0 < photo['bytes'] < 1024 * 1024 * 1024
    assert len({x['key'] for x in photos}) == 2
    assert min(x['bytes'] for x in photos) < 12 * 1024 * 1024
    assert max(x['bytes'] for x in photos) > 40 * 1024 * 1024


def job_resource(app_id, name):
    match = re.fullmatch(r'/subscriptions/([^/]+)/resourceGroups/([^/]+)/providers/Microsoft\.App/containerApps/hidi-web', app_id, re.I)
    assert match, 'Expected the production web app resource ID'
    subscription, group = match.groups()
    assert subscription.lower() == '91d9572d-0f0b-47fe-802d-0eef36d7c719' and group.lower() == 'rg-hidi-prod'
    assert re.fullmatch(r'image-smoke-[0-9]+-[0-9]+', name), 'Unexpected validation job name'
    return '/subscriptions/' + subscription + '/resourceGroups/' + group + '/providers/Microsoft.App/jobs/' + name


def cleanup_job(cloud, name, url, owned):
    names = cloud.azure('containerapp', 'job', 'list', '-g', 'rg-hidi-prod', '--query', '[].name')
    if name in names:
        owned(cloud.azure('rest', '--method', 'get', '--url', url))
        cloud.azure('rest', '--method', 'delete', '--url', url)
        for _ in range(40):
            names = cloud.azure('containerapp', 'job', 'list', '-g', 'rg-hidi-prod', '--query', '[].name')
            if name not in names:
                return True
            time.sleep(3)
        raise AssertionError('Owned smoke job cleanup not verified')
    return True


def main(storage_only_states=None):
    r = load_release()
    photos = json.loads(Path(sys.argv[1]).read_text())
    validate_photos(photos)
    run = r.r.guard.run_key()
    name = 'image-smoke-' + run
    web = r.r.cloud.app('hidi-web')
    deployed = storage_only_states if storage_only_states is not None else r.read('promotion-live.json')['states']
    r.r.photo.unchanged(deployed)
    if storage_only_states is None:
        assert r.r.cloud.snapshot(web)['image'] == WEB
    entries = web['properties']['template']['containers'][0]['env']
    env = {x['name']: x.get('value', '') for x in entries if not x.get('secretRef')}
    identities = web['identity']['userAssignedIdentities']
    storage = []
    for resource, value in identities.items():
        client = (value or {}).get('clientId')
        if not client:
            client = r.r.cloud.azure('identity', 'show', '--ids', resource, '--query', 'clientId')
        if client.lower() == env['AZURE_CLIENT_ID'].lower():
            storage.append(resource)
    assert len(storage) == 1
    registry = next(x for x in web['properties']['configuration']['registries'] if x['server'] == r.r.images.REGISTRY)
    pulls = [x for x in identities if x.lower() == str(registry.get('identity', '')).lower()]
    if not pulls:
        assert str(registry.get('identity', '')).lower() in ['', 'system']
        pulls = storage
    attached = sorted(set(storage + pulls))
    resource = job_resource(web['id'], name)
    url = 'https://management.azure.com' + resource + '?api-version=2025-07-01'
    options = {x: env[x] for x in ['AZURE_STORAGE_ACCOUNT', 'AZURE_CLIENT_ID']}
    options['HIDI_SMOKE_PHOTOS'] = json.dumps(photos)
    body = {'location': web['location'], 'tags': {'hidi-image-smoke': run}, 'identity': {'type': 'UserAssigned', 'userAssignedIdentities': {x: {} for x in attached}}, 'properties': {'environmentId': web['properties'].get('environmentId') or web['properties']['managedEnvironmentId'], 'configuration': {'triggerType': 'Manual', 'replicaTimeout': 480, 'replicaRetryLimit': 0, 'manualTriggerConfig': {'replicaCompletionCount': 1, 'parallelism': 1}, 'registries': [{'server': r.r.images.REGISTRY, 'identity': pulls[0]}]}, 'template': {'containers': [{'name': 'photo', 'image': WEB, 'command': ['node'], 'args': ['--input-type=module', '-e', PROBE], 'resources': {'cpu': 0.5, 'memory': '1Gi'}, 'env': [{'name': key, 'value': value} for key, value in options.items()]}]}}}
    if web['properties'].get('workloadProfileName'):
        body['properties']['workloadProfileName'] = web['properties']['workloadProfileName']
    report = {'passed': False, 'sourceSha': SOURCE, 'image': WEB, 'job': name, 'databaseWrites': 0, 'blobWrites': 0, 'persistedServingVerified': False, 'scope': 'storage-only' if storage_only_states is not None else 'live-storage-and-serving', 'appResourceId': web['id'], 'jobResourceId': resource}
    attempted = False

    def interrupt(signum, frame):
        raise RuntimeError('Storage inspection interrupted')

    def owned(value):
        assert value['id'].lower() == resource.lower()
        assert value['tags'].get('hidi-image-smoke') == run
        assert value['properties']['template']['containers'][0]['image'] == WEB
        return value

    signal.signal(signal.SIGTERM, interrupt)
    signal.signal(signal.SIGINT, interrupt)
    try:
        # Listing only job names avoids treating access failures as absence.
        jobs = r.r.cloud.azure('containerapp', 'job', 'list', '-g', 'rg-hidi-prod', '--query', '[].name')
        assert name not in jobs, 'Do not overwrite an existing job'
        path = r.P / 'smoke-job.json'
        path.write_text(json.dumps(body)); path.chmod(0o600)
        attempted = True
        r.r.cloud.azure('rest', '--method', 'put', '--url', url, '--headers', 'If-None-Match=*', '--body', '@' + str(path))
        for _ in range(48):
            current = owned(r.r.cloud.azure('rest', '--method', 'get', '--url', url))
            if current['properties'].get('provisioningState') == 'Succeeded':
                break
            assert current['properties'].get('provisioningState') not in ['Failed', 'Canceled']
            time.sleep(5)
        else:
            raise AssertionError('Storage inspection job provisioning timed out')
        execution = r.r.cloud.azure('containerapp', 'job', 'start', '-g', 'rg-hidi-prod', '-n', name)['name']
        for _ in range(100):
            executions = r.r.cloud.azure('containerapp', 'job', 'execution', 'list', '-g', 'rg-hidi-prod', '-n', name)
            status = next((x['properties']['status'] for x in executions if x['name'] == execution), '')
            if status in ['Succeeded', 'Failed', 'Stopped', 'Degraded']:
                break
            time.sleep(5)
        assert status == 'Succeeded', 'Uploaded photo storage validation failed: ' + status
        for _ in range(5):
            logs = subprocess.run(['az', 'containerapp', 'job', 'logs', 'show', '-g', 'rg-hidi-prod', '-n', name, '--execution', execution, '--container', 'photo', '--tail', '100', '--format', 'text', '--only-show-errors'], capture_output=True, text=True, timeout=45)
            lines = [line.split('HIDI_UPLOADED_PHOTOS ', 1)[1] for line in logs.stdout.splitlines() if 'HIDI_UPLOADED_PHOTOS ' in line]
            if lines:
                report['details'] = json.JSONDecoder().raw_decode(lines[-1])[0]
                break
            time.sleep(2)
        assert report['details']['passed'] and len(report['details']['results']) == 2
        for result in report['details']['results'] if storage_only_states is None else []:
            # Persisted-serving assertion belongs on the freshly uploaded original.
            path = '/_next/image?' + urlencode({'url': '/media/' + result['key'] + '?hidi_image=3', 'w': 640, 'q': 75})
            request = urllib.request.Request(r.r.cloud.BASE + path, headers={'Accept': 'image/webp'})
            with urllib.request.urlopen(request, timeout=60) as response:
                data = response.read(20 * 1024 * 1024)
                assert response.status == 200 and response.headers.get('X-Hidi-Image-Cache') == 'PERSISTED'
                assert response.headers.get('X-Hidi-Image-Version') == '3' and response.headers.get('Content-Type') == 'image/webp'
            derivative = next(x for x in result['derivatives'] if x['width'] == 640)
            assert hashlib.sha256(data).hexdigest() == derivative['sha256']
        r.r.photo.unchanged(deployed)
        report.update({'passed': True, 'normalAndLargeVerified': True, 'persistedServingVerified': storage_only_states is None})
    except BaseException as error:
        report['passed'] = False
        report['error'] = str(error)
        raise
    finally:
        try:
            if attempted:
                report['validationJobRemoved'] = cleanup_job(r.r.cloud, name, url, owned)
            r.r.photo.unchanged(deployed)
            report['productionTrafficChanged'] = False
        except BaseException as error:
            report['passed'] = False
            report['cleanupOrStateError'] = str(error)
            raise
        finally:
            r.save('uploaded-photo-storage.json', report)
            print(json.dumps(report), flush=True)
    assert report['passed'] and report['validationJobRemoved']


if __name__ == '__main__':
    main()
