"""Optional Azure metadata must not prevent an image-only update or rollback."""
import copy
import importlib.util
import json
import os
from pathlib import Path
import tempfile

spec=importlib.util.spec_from_file_location('release',Path(__file__).resolve().parents[1]/'deploy/performance/rollout.py')
release=importlib.util.module_from_spec(spec);spec.loader.exec_module(release)

for secrets in [None, [], [{'name':'fixture-secret','value':'fixture-redaction-value'}]]:
    data={'id':'/fixture','location':'centralindia','properties':{
        'template':{'containers':[{'name':'web','image':'old','env':[{'name':'API_URL','value':'http://fixture'}],
            'resources':{'cpu':1,'memory':'2Gi'},'probes':[{'type':'Readiness','httpGet':{'path':'/health','port':3000}}]}],
            'scale':{'minReplicas':1,'maxReplicas':2}},
        'configuration':{'secrets':secrets,'ingress':{'external':True}}}}
    original=copy.deepcopy(data);calls=[]
    def azure(*args,redact=()):
        body=json.loads(Path(args[args.index('--body')+1][1:]).read_text())
        calls.append((body,redact));return {}
    release.guard.azure=azure
    with tempfile.TemporaryDirectory() as directory:
        os.environ['RUNNER_TEMP']=directory
        release.write_image(data,'candidate','perf-fixture')
        release.write_image(data,'old','rollback-fixture')
        assert not list(Path(directory).iterdir()), 'Private patch file must be removed'
    assert data==original, 'Capture and protected settings must remain unchanged'
    for (body,redact),image,suffix in zip(calls,['candidate','old'],['perf-fixture','rollback-fixture']):
        expected=copy.deepcopy(original['properties']['template']['containers'])
        expected[0]['image']=image
        assert body=={'location':'centralindia','properties':{'template':{'containers':expected,'revisionSuffix':suffix}}}
        if secrets:assert 'fixture-redaction-value' in redact
    assert len(calls)==2
print('PASS: null/empty/present secrets; exact image-only deploy and rollback; capture/env/resources/probes preserved')
