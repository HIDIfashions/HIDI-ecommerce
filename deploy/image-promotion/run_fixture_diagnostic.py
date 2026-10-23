"""Owned isolated 1 GiB diagnostic job; never changes live app or Blob data."""
import json,subprocess,sys,time,signal
from pathlib import Path
from immutable_image_promote import load_release,SOURCE,WEB
from inspect_uploaded_photos import job_resource,cleanup_job
r=load_release();run=r.r.guard.run_key();name='image-smoke-'+run
expected=r.read('before.json');rollback=r.read('promotion-rollback.json')
assert rollback['passed'] and rollback['apiUnchanged'] and rollback['state']['ready']=='hidi-web--rangefiverb39919863794a1'
expected['hidi-web']=rollback['state'];r.r.photo.unchanged(expected)
web=r.r.cloud.app('hidi-web');resource=job_resource(web['id'],name)
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
body={'location':web['location'],'tags':{'hidi-image-smoke':run},'identity':{'type':'UserAssigned','userAssignedIdentities':{x:{} for x in attached}},'properties':{'environmentId':web['properties'].get('environmentId') or web['properties']['managedEnvironmentId'],'configuration':{'triggerType':'Manual','replicaTimeout':480,'replicaRetryLimit':0,'manualTriggerConfig':{'replicaCompletionCount':1,'parallelism':1},'registries':[{'server':r.r.images.REGISTRY,'identity':pulls[0]}]},'template':{'containers':[{'name':'photo','image':WEB,'command':['node'],'args':['--input-type=module','-e',probe],'resources':{'cpu':0.5,'memory':'1Gi'},'env':[{'name':key,'value':env[key]} for key in ['AZURE_STORAGE_ACCOUNT','AZURE_CLIENT_ID']]}]}}}
if web['properties'].get('workloadProfileName'):body['properties']['workloadProfileName']=web['properties']['workloadProfileName']
report={'diagnosticOnly':True,'sourceSha':SOURCE,'image':WEB,'job':name,'databaseWrites':0,'blobWrites':0,'productionTrafficChanged':False};attempted=False
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
        if lines:report['details']=json.JSONDecoder().raw_decode(lines[-1])[0];break
        report['diagnosticLog']=output[-10000:];time.sleep(2)
    assert status=='Succeeded' and report.get('details',{}).get('diagnosticCompleted'),'Diagnostic did not finish'
    report['diagnosticCompleted']=True
except Exception as error:report['error']=str(error);raise
finally:
    try:
        if attempted:report['validationJobRemoved']=cleanup_job(r.r.cloud,name,url,owned)
        r.r.photo.unchanged(expected);report['restoredProductionUnchanged']=True
    finally:r.save('fixture-memory-diagnostic.json',report);print(json.dumps(report,indent=2))

