"""Exact immutable candidate: sustained memory and owned Azure storage acceptance."""
import json,subprocess,sys,time,signal
from pathlib import Path
from immutable_image_promote import load_release
from inspect_uploaded_photos import job_resource,cleanup_job
SOURCE='9e809590651122dbf2b7c7ddfbbfe013a65f4364'
WEB='acrhidiprod0927.azurecr.io/hidi-web@sha256:b544955b7937685db8472c70163685ef6a5fe243ae83f9099ca240b82ee439c8'
r=load_release();run=r.r.guard.run_key();name='image-smoke-'+run
assert r.source_sha()==SOURCE,'Wrong immutable candidate source checkout'
expected=r.read('before.json');rollback=r.read('promotion-rollback.json')
assert rollback['passed'] and rollback['apiUnchanged'] and rollback['state']['ready']=='hidi-web--rangefiverb39919863794a1'
expected['hidi-web']=rollback['state'];r.r.photo.unchanged(expected)
web=r.r.cloud.app('hidi-web');resource=job_resource(web['id'],name)
# Verify that the restart-count API needed by the live rollback monitor is
# available before any production promotion. Existing baseline restarts are
# recorded, not mistaken for restarts of a new candidate revision.
replicas_url='https://management.azure.com'+web['id']+'/revisions/'+expected['hidi-web']['ready']+'/replicas?api-version=2025-07-01'
replicas=r.r.cloud.azure('rest','--method','get','--url',replicas_url)
restart_observations=[]
assert replicas.get('value'),'Baseline replica evidence missing'
container_names={item['name'] for item in web['properties']['template']['containers']}
for replica in replicas['value']:
    selected=[item for item in replica['properties']['containers'] if item['name'] in container_names]
    assert {item['name'] for item in selected}==container_names
    for item in selected:
        assert type(item.get('restartCount')) is int and item['restartCount']>=0
        assert item.get('ready') is True and item.get('runningState')=='Running'
        restart_observations.append({'replica':replica['name'],'container':item['name'],'restartCount':item['restartCount'],'ready':item['ready'],'runningState':item['runningState']})
url='https://management.azure.com'+resource+'?api-version=2025-07-01'
env={x['name']:x.get('value','') for x in web['properties']['template']['containers'][0]['env'] if not x.get('secretRef')}
identities=web['identity']['userAssignedIdentities'];matches=[]
for identity,value in identities.items():
    client=(value or {}).get('clientId') or r.r.cloud.azure('identity','show','--ids',identity,'--query','clientId')
    if client.lower()==env['AZURE_CLIENT_ID'].lower():matches.append(identity)
assert len(matches)==1
registry=next(x for x in web['properties']['configuration']['registries'] if x['server']==r.r.images.REGISTRY)
pulls=[x for x in identities if x.lower()==str(registry.get('identity','')).lower()]
if not pulls:
    assert str(registry.get('identity','')).lower() in ['', 'system'];pulls=matches
attached=sorted(set(matches+pulls))
probe=Path(__file__).with_name('reproduce_fixture.mjs').read_text()
body={'location':web['location'],'tags':{'hidi-image-smoke':run},'identity':{'type':'UserAssigned','userAssignedIdentities':{x:{} for x in attached}},'properties':{'environmentId':web['properties'].get('environmentId') or web['properties']['managedEnvironmentId'],'configuration':{'triggerType':'Manual','replicaTimeout':480,'replicaRetryLimit':0,'manualTriggerConfig':{'replicaCompletionCount':1,'parallelism':1},'registries':[{'server':r.r.images.REGISTRY,'identity':pulls[0]}]},'template':{'containers':[{'name':'photo','image':WEB,'command':['node'],'args':['--input-type=module','-e',probe],'resources':{'cpu':0.5,'memory':'1Gi'},'env':[{'name':key,'value':env[key]} for key in ['AZURE_STORAGE_ACCOUNT','AZURE_CLIENT_ID']]+[{'name':'HIDI_PHOTO_VALIDATION_RUN','value':run}]}]}}}
if web['properties'].get('workloadProfileName'):body['properties']['workloadProfileName']=web['properties']['workloadProfileName']
report={'diagnosticOnly':True,'sourceSha':SOURCE,'image':WEB,'job':name,'databaseWrites':0,'blobWrites':0,'productionTrafficChanged':False,'restartMonitorPreflight':{'passed':True,'baselineObservations':restart_observations}};attempted=False
def owned(current):
    assert current['id'].lower()==resource.lower() and current['tags'].get('hidi-image-smoke')==run
    assert current['properties']['template']['containers'][0]['image']==WEB
    return current
def interrupted(signum,frame):raise RuntimeError('Diagnostic interrupted')
signal.signal(signal.SIGTERM,interrupted);signal.signal(signal.SIGINT,interrupted)
try:
    assert name not in r.r.cloud.azure('containerapp','job','list','-g','rg-hidi-prod','--query','[].name')
    path=r.P/'fixture-job.json';path.write_text(json.dumps(body));path.chmod(0o600)
    attempted=True;r.r.cloud.azure('rest','--method','put','--url',url,'--headers','If-None-Match=*','--body','@'+str(path))
    for _ in range(48):
        state=owned(r.r.cloud.azure('rest','--method','get','--url',url))['properties']['provisioningState']
        if state=='Succeeded':break
        assert state not in ['Failed','Canceled'];time.sleep(5)
    else:raise AssertionError('Job provisioning timed out')
    execution=r.r.cloud.azure('containerapp','job','start','-g','rg-hidi-prod','-n',name)['name']
    for _ in range(100):
        rows=r.r.cloud.azure('containerapp','job','execution','list','-g','rg-hidi-prod','-n',name)
        status=next((x['properties']['status'] for x in rows if x['name']==execution),'')
        if status in ['Succeeded','Failed','Stopped','Degraded']:break
        time.sleep(5)
    report['executionStatus']=status
    for _ in range(5):
        try:
            logs=subprocess.run(['az','containerapp','job','logs','show','-g','rg-hidi-prod','-n',name,'--execution',execution,'--container','photo','--tail','100','--format','text','--only-show-errors'],capture_output=True,text=True,timeout=45)
            output=logs.stdout+logs.stderr
        except subprocess.TimeoutExpired as error:
            output=error.stdout or ''
            if isinstance(output,bytes):output=output.decode('utf-8','replace')
            report.setdefault('logReadTimeouts',0);report['logReadTimeouts']+=1
        lines=[line.split('HIDI_FIXTURE_DIAGNOSTIC ',1)[1] for line in output.splitlines() if 'HIDI_FIXTURE_DIAGNOSTIC ' in line]
        chunks=[]
        for line in output.splitlines():
            if 'HIDI_FIXTURE_CHUNK ' in line:
                try:chunks.append(json.JSONDecoder().raw_decode(line.split('HIDI_FIXTURE_CHUNK ',1)[1])[0])
                except ValueError:pass
        if chunks:
            parts={part['index']:part for part in chunks};total=chunks[-1]['total']
            if len(parts)==total and set(parts)==set(range(total)):
                lines=[''.join(parts[index]['data'] for index in range(total))]
        if lines:report['details']=json.JSONDecoder().raw_decode(lines[-1])[0];break
        report['diagnosticLog']=output[-10000:];time.sleep(2)
    assert status=='Succeeded' and report.get('details',{}).get('diagnosticCompleted'),'Diagnostic did not finish'
    report['blobWrites']=report['details'].get('blobWrites',0)
    report['validationBlobsRemoved']=report['details'].get('validationBlobsRemoved',False)
    assert all(case['code']==0 and not case['timedOut'] for case in report['details']['results']),'Sustained-load reproduction failed; inspect retained runtime and cgroup evidence'
    for case in report['details']['results']:
        before=case['eventsBefore'];after=case['eventsAfter']
        fail='/sys/fs/cgroup/memory/memory.failcnt';oom='/sys/fs/cgroup/memory/memory.oom_control'
        assert int(after[fail])==int(before[fail]),'Memory limit hit under supported image workload'
        def kills(values):
            return int(next(line.split()[1] for line in values[oom].splitlines() if line.startswith('oom_kill ')))
        assert kills(after)==kills(before),'Container OOM kill under supported image workload'
    details=report['details']
    assert details['imageAllocatorArenaMax']=='2','Immutable image allocator differs'
    assert details['realAzurePassed'] and details['originalUnchanged'] and details['exactFixtureHashVerified']
    assert details['validationBlobsRemoved'] and details['validationBlobsDeleted']==16
    assert len(details['realAzureResults'])==16 and all(item['valid'] for item in details['realAzureResults'])
    for case in details['results']:
        counts=case['stageCounts']
        assert counts['preheat-response']==24 and counts['full-runtime-upload-response']==3 and counts['legacy-image-response']==3
        assert {x['width'] for x in case['responses'] if x['stage']=='legacy-image-response'}=={3840,1920,1200}
    report['memoryPressureGatePassed']=True
    report['passed']=True
    report['diagnosticCompleted']=True
except Exception as error:report['error']=str(error);raise
finally:
    try:
        if 'details' in report:
            report['blobWrites']=report['details'].get('blobWrites',0)
            report['validationBlobsRemoved']=report['details'].get('validationBlobsRemoved',False)
        if attempted:report['validationJobRemoved']=cleanup_job(r.r.cloud,name,url,owned)
        r.r.photo.unchanged(expected);report['restoredProductionUnchanged']=True
    finally:r.save('fixture-memory-diagnostic.json',report);print(json.dumps(report,indent=2))
