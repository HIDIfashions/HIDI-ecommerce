"""Recover only the accidental source deployment owned by this gallery task."""
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import time

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('portrait_release', HERE / 'release.py')
r = importlib.util.module_from_spec(spec)
spec.loader.exec_module(r)
r.setup()
owned_revision = 'hidi-web--landing6d41d8f371'
current = r.cloud.app('hidi-web')
state = r.cloud.snapshot(current)
if state['latest'] != owned_revision:
    print('PASS: owned accidental source revision is not current; no recovery write')
    raise SystemExit(0)
r.immutable(state['image'], 'web')
api = r.cloud.snapshot(r.cloud.app('hidi-api'))
subprocess.run(['docker', 'pull', state['image']], check=True)
active_layers = json.loads(r.images.docker('image', 'inspect', state['image']))[0]['RootFS']['Layers']
revisions = r.cloud.azure('containerapp', 'revision', 'list', '-g', r.cloud.GROUP, '-n', 'hidi-web', '--all')
prior = sorted((entry for entry in revisions if entry['name'] != owned_revision), key=lambda entry: entry['properties'].get('createdTime', ''), reverse=True)
prior.append({'properties': {'template': {'containers': [{'image': 'acrhidiprod0927.azurecr.io/hidi-web@sha256:5ac5783da15cf3b2359f1a26c0e341b981db4852335479124851ad5dfddac57b'}]}}})
previous = None
for revision in prior:
    image = revision['properties']['template']['containers'][0]['image']
    if image == state['image']: continue
    r.immutable(image, 'web')
    subprocess.run(['docker', 'pull', image], check=True)
    layers = json.loads(r.images.docker('image', 'inspect', image))[0]['RootFS']['Layers']
    if layers == active_layers[:-1]:
        previous = image
        break
assert previous, 'Exact parent runtime must be identified before source recovery'
tag_name = 'backup-portrait-source-recovery-' + r.run_key()
tag = r.images.REGISTRY + '/hidi-web:' + tag_name
for args in [('tag', previous, tag), ('push', tag)]: subprocess.run(['docker', *args], check=True)
digest = subprocess.check_output(['az','acr','repository','show','--name','acrhidiprod0927','--image','hidi-web:'+tag_name,'--query','digest','-o','tsv','--only-show-errors'],text=True).strip()
assert previous.endswith('@'+digest), 'Recovery backup must match exact parent digest'
suffix = 'portraitsourcefix' + r.run_key('a')
r.conditional_write_image(current, previous, suffix, 'source-recovery-write.json')
recovered = r.cloud.snapshot(r.wait_ready(previous, suffix, {'hidi-web': state}))
assert recovered['settingsHash'] == state['settingsHash'], 'Recovery must preserve current app settings'
assert r.cloud.snapshot(r.cloud.app('hidi-api')) == api, 'Recovery leaves API untouched'
r.save('source-recovery.json', {'passed': True, 'ownedRevision': owned_revision, 'exactParentLayersVerified': True, 'restoredImage': previous, 'settingsPreserved': True, 'apiUnchanged': True})
print('PASS: restored the exact parent runtime of the owned source deployment, preserving current settings and API')
