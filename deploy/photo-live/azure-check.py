"""Owned storage check using captured app identities; no role grants or live edits."""
from pathlib import Path
from urllib.parse import quote
import importlib.util,json,subprocess,time,os,re,sys
p=Path(__file__).with_name('release.py');s=importlib.util.spec_from_file_location('photo_job_release',p);r=importlib.util.module_from_spec(s);s.loader.exec_module(r)
run=r.r.guard.run_key();name='photo-check-'+run
report={'passed':False,'job':name,'run':run,'photoSourceSha':r.source_sha(),'productionTrafficChanged':False,'databaseWrites':0,'roleAssignmentsChanged':False}
before=r.r.photo.states();attempted=False;job_url=None;expected=None;executionName=None;subscription=None;group=None

def azure_resource_missing(stderr):
 # Decode the error code, never match a phrase inside an authorization message.
 # ARM returns ContainerAppsJobNotFound after successful job deletion.
 allowed={'ResourceNotFound','ContainerAppsJobNotFound'}
 for position in re.finditer(r'\{',stderr):
  try:
   payload=json.JSONDecoder().raw_decode(stderr[position.start():])[0]
  except (ValueError,TypeError):continue
  if isinstance(payload,dict) and isinstance(payload.get('error'),dict):
   return payload['error'].get('code') in allowed
 match=re.match(r'^ERROR:\s*\(([A-Za-z0-9_.-]+)\)',stderr.strip())
 return bool(match and match.group(1) in allowed)

def az(args,timeout=120,absent=False):
 result=subprocess.run(['az',*args,'--only-show-errors','-o','json'],capture_output=True,text=True,timeout=timeout)
 if result.returncode:
  if absent and args[:3]==['rest','--method','get'] and azure_resource_missing(result.stderr):return None
  raise RuntimeError('Validation command failed: '+' '.join(args[:3])+'; '+result.stderr[-1800:])
 return json.loads(result.stdout) if result.stdout.strip() else None

def live_state_diagnostics(reference):
 # Only immutable image IDs, revision names and configuration hashes are saved.
 # Never expose environment values or substitute this for the unchanged guard.
 result={}
 for app,state in reference.items():
  try:
   current=r.r.cloud.snapshot(r.r.cloud.app(app))
   keys=sorted(key for key in set(state)|set(current) if state.get(key)!=current.get(key))
   result[app]={'matches':not keys,'changedKeys':keys,'expected':state,'observed':current}
  except Exception as error:result[app]={'matches':False,'errorType':type(error).__name__}
 return result

def storage_binding(web):
 identities=web.get('identity',{}).get('userAssignedIdentities',{})
 entries=web['properties']['template']['containers'][0].get('env',[])
 env={item['name']:str(item.get('value','')).strip() for item in entries if not item.get('secretRef')}
 assert all(env.get(key) for key in ['AZURE_STORAGE_ACCOUNT','AZURE_CLIENT_ID']),'Existing explicit web storage identity required'
 assert isinstance(identities,dict) and identities,'No user-assigned identity is attached to the captured production app'
 wanted=env['AZURE_CLIENT_ID'].lower();matches=[];resolved=0
 for resource,value in identities.items():
  assert re.fullmatch(r'/subscriptions/[^/]+/resourceGroups/[^/]+/providers/Microsoft\.ManagedIdentity/userAssignedIdentities/[^/]+',resource,re.I),'Captured identity reference is not a managed identity resource'
  client=str((value or {}).get('clientId','')).strip().lower()
  if not client:
   # ARM may return empty objects for attached identities. Resolve only that
   # existing reference, returning just its ID and client ID. Do not enumerate
   # other identities, inspect credentials, or change any identity or role.
   item=az(['identity','show','--ids',resource,'--query','{id:id,clientId:clientId}'])
   assert isinstance(item,dict) and str(item.get('id','')).lower()==resource.lower(),'Identity read returned a different resource'
   client=str(item.get('clientId','')).strip().lower();resolved+=1
  assert re.fullmatch(r'[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}',client),'Attached identity client ID could not be verified'
  if client==wanted:matches.append(resource)
 assert len(matches)==1,'The configured storage client ID does not uniquely match the app attached identities'
 report['identityBinding']={'matched':True,'attachedReferenceCount':len(identities),'resolvedExistingReferences':resolved}
 return env,identities,matches[0]

if sys.argv[1:]==['identity-preflight']:
 try:
  r.r.photo.unchanged(before);storage_binding(r.r.photo.originals()['hidi-web']);r.r.photo.unchanged(before)
  report.update({'passed':True,'readOnly':True})
 except Exception as error:report['error']=str(error)
 r.save('identity-preflight.json',report);print(json.dumps(report,indent=2))
 assert report['passed'],'Existing identity binding could not be verified; no package or production change is allowed'
 sys.exit(0)
assert not sys.argv[1:],'Unsupported storage-check mode'

def owned(current):
 assert current and current.get('id','').lower()==expected['id'].lower(),'Unexpected validation resource'
 assert current.get('tags',{}).get('hidi-photo-release')==run,'Validation resource belongs to another run'
 assert current['properties']['template']['containers'][0]['image']==report['image'],'Validation image changed independently'
 return current

def logs():
 if not executionName:return
 for _ in range(3):
  result=subprocess.run(['az','containerapp','job','logs','show','--subscription',subscription,'-g',group,'-n',name,'--execution',executionName,'--container','photo','--tail','100','--format','text','--only-show-errors'],capture_output=True,text=True,timeout=45)
  for line in result.stdout.splitlines():
   if 'HIDI_PHOTO_STORAGE_RESULT ' not in line:continue
   try:report['details']=json.JSONDecoder().raw_decode(line.split('HIDI_PHOTO_STORAGE_RESULT ',1)[1])[0]
   except json.JSONDecodeError:continue
   return
  time.sleep(2)

try:
 r.r.photo.unchanged(before);published=r.verify();web=r.r.photo.originals()['hidi-web'];report['image']=published['web']
 match=re.fullmatch(r'/subscriptions/([^/]+)/resourceGroups/([^/]+)/providers/Microsoft\.App/containerApps/hidi-web',web['id'],re.I)
 assert match,'Captured production app ID is required';subscription,group=match.groups()
 env,identities,storage=storage_binding(web)
 registry=next(item for item in web['properties']['configuration']['registries'] if item['server']==r.r.images.REGISTRY)
 configured=str(registry.get('identity') or '').rstrip('/')
 registry_matches=[key for key in identities if key.rstrip('/').lower()==configured.lower()]
 if registry_matches:
  pull_identity=registry_matches[0]
 else:
  assert configured.lower() in ('','system'),'Unrecognized registry identity; no alternate credentials will be used'
  # Try only the app's already attached storage identity with its existing
  # permissions. ARM job creation does not auto-grant AcrPull as the CLI can.
  # Missing existing pull permission makes the test fail; no grants are added.
  pull_identity=storage
 attached=sorted(set([storage,pull_identity]))
 assert all(key in identities for key in attached)
 environment=web['properties'].get('environmentId') or web['properties'].get('managedEnvironmentId');assert environment
 options={key:env[key] for key in ['AZURE_STORAGE_ACCOUNT','AZURE_CLIENT_ID']}
 options['HIDI_PHOTO_VALIDATION_RUN']=run
 job_id='/subscriptions/'+subscription+'/resourceGroups/'+group+'/providers/Microsoft.App/jobs/'+name
 job_url='https://management.azure.com'+quote(job_id,safe='/')+'?api-version=2025-07-01'
 expected={'id':job_id,'location':web['location'],'tags':{'hidi-photo-release':run},'identity':{'type':'UserAssigned','userAssignedIdentities':{key:{} for key in attached}},'properties':{'environmentId':environment,'configuration':{'triggerType':'Manual','replicaTimeout':600,'replicaRetryLimit':0,'manualTriggerConfig':{'replicaCompletionCount':1,'parallelism':1},'registries':[{'server':r.r.images.REGISTRY,'identity':pull_identity}]},'template':{'containers':[{'name':'photo','image':published['web'],'command':['node'],'args':['/app/photo-stream/validate-storage.mjs'],'resources':{'cpu':0.5,'memory':'1Gi'},'env':[{'name':key,'value':value} for key,value in options.items()]}]}}}
 if web['properties'].get('workloadProfileName'):expected['properties']['workloadProfileName']=web['properties']['workloadProfileName']
 assert az(['rest','--method','get','--url',job_url],absent=True) is None,'Validation resource already exists; never overwrite it'
 body=dict(expected);body.pop('id');path=r.P/'validation-job.json';path.write_text(json.dumps(body));path.chmod(0o600)
 r.r.photo.unchanged(before);attempted=True
 az(['rest','--method','put','--url',job_url,'--headers','If-None-Match=*','--body','@'+str(path)],180)
 deadline=time.monotonic()+240
 while time.monotonic()<deadline:
  current=owned(az(['rest','--method','get','--url',job_url]))
  state=current['properties'].get('provisioningState','')
  if state=='Succeeded':break
  assert state not in ['Failed','Canceled','Cancelled'],'Validation resource did not provision'
  time.sleep(5)
 else:raise AssertionError('Validation resource provisioning did not complete')
 execution=az(['containerapp','job','start','--subscription',subscription,'-g',group,'-n',name]);executionName=execution['name'];report['execution']=executionName
 status='';start=time.monotonic()
 while time.monotonic()-start<650:
  rows=az(['containerapp','job','execution','list','--subscription',subscription,'-g',group,'-n',name]);item=next((x for x in rows if x['name']==executionName),None)
  status=(item or {}).get('properties',{}).get('status','')
  if status in ['Succeeded','Failed','Stopped','Degraded']:break
  time.sleep(5)
 report['status']=status
 logs()
 assert status=='Succeeded','Real Azure storage job did not succeed: '+status
 details=report.get('details')
 assert isinstance(details,dict) and details.get('run')==run and details.get('passed') is True and details.get('deleted') is True and details.get('originalUnchanged') is True and details.get('sourceBytes',0)>40*1024*1024,'Original integrity, large source and cleanup evidence must pass'
 report.update({'passed':True,'sourceExceeds40MiB':True,'sourceHashVerified':True,'temporaryBlobDeleted':True,'memoryLimit':'1Gi','cpuLimit':0.5,'identitySource':'captured web configuration','registryRoleGrants':0})
except Exception as error:
 report['passed']=False;report['error']=str(error)
finally:
 if attempted:
  try:
   current=az(['rest','--method','get','--url',job_url],absent=True)
   if current:
    owned(current);assert r.verify()['web']==report['image']
    az(['rest','--method','delete','--url',job_url],180)
    deadline=time.monotonic()+120
    while time.monotonic()<deadline:
     remaining=az(['rest','--method','get','--url',job_url],absent=True)
     if remaining is None:break
     owned(remaining);time.sleep(3)
    else:raise AssertionError('Owned validation job removal did not complete')
    report['validationJobRemoved']=True
   else:report['validationJobRemoved']=False
  except Exception as error:report['passed']=False;report['cleanupError']=str(error)
 try:r.r.photo.unchanged(before)
 except Exception as error:
  report['passed']=False;report['liveStateError']=str(error)
  report['liveStateComparison']=live_state_diagnostics(before)
 r.save('azure-storage-test.json',report);print(json.dumps(report,indent=2))
assert report['passed'] and report.get('validationJobRemoved'),'Azure validation failed; production rollout must not proceed'
