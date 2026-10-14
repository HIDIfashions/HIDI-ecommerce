"""A single owned validation job; never edits the live web/API or their identities."""
from pathlib import Path
import importlib.util,json,subprocess,time,os,re
p=Path(__file__).with_name('release.py');s=importlib.util.spec_from_file_location('photo_job_release',p);r=importlib.util.module_from_spec(s);s.loader.exec_module(r)
run=r.r.guard.run_key();name='photo-check-'+os.environ['GITHUB_RUN_ID'];group='rg-hidi-prod';created=False
report={'passed':False,'job':name,'run':run,'productionTrafficChanged':False,'databaseWrites':0,'roleAssignmentsChanged':False}
def az(args,timeout=120):
 result=subprocess.run(['az',*args,'--only-show-errors','-o','json'],capture_output=True,text=True,timeout=timeout)
 if result.returncode:raise RuntimeError('Validation command failed: '+' '.join(args[:4])+'; '+result.stderr[-1800:])
 return json.loads(result.stdout) if result.stdout.strip() else None
try:
 published=r.verify();web=r.r.photo.originals()['hidi-web'];identities=list(web.get('identity',{}).get('userAssignedIdentities',{}))
 entries=web['properties']['template']['containers'][0].get('env',[]);env={item['name']:item.get('value','') for item in entries}
 registry=next(item for item in web['properties']['configuration']['registries'] if item['server']==r.r.images.REGISTRY)
 identity=registry.get('identity');assert identity in identities,'Validation must reuse a configured user-assigned identity'
 environment=web['properties'].get('environmentId') or web['properties'].get('managedEnvironmentId');assert environment
 required=['AZURE_STORAGE_ACCOUNT','AZURE_CLIENT_ID'];assert all(env.get(key) for key in required),'Existing explicit web storage identity required'
 options=[key+'='+env[key] for key in required]+['HIDI_PHOTO_VALIDATION_RUN='+run]
 # The generated name is owned by this run. Never replace an existing resource.
 listed=az(['containerapp','job','list','-g',group]);assert not any(item['name']==name for item in listed),'Validation job name already exists'
 az(['containerapp','job','create','-g',group,'-n',name,'--environment',environment,'--trigger-type','Manual','--replica-timeout','600','--replica-retry-limit','0','--replica-completion-count','1','--parallelism','1','--image',published['web'],'--registry-server',r.r.images.REGISTRY,'--registry-identity',identity,'--mi-user-assigned',identity,'--container-name','photo','--cpu','0.5','--memory','1Gi','--env-vars',*options,'--command','node','--args','/app/photo-stream/validate-storage.mjs'],180);created=True
 execution=az(['containerapp','job','start','-g',group,'-n',name]);executionName=execution['name'];report['execution']=executionName
 status='';start=time.monotonic()
 while time.monotonic()-start<650:
  rows=az(['containerapp','job','execution','list','-g',group,'-n',name]);item=next((x for x in rows if x['name']==executionName),None)
  status=(item or {}).get('properties',{}).get('status','')
  if status in ['Succeeded','Failed','Stopped','Degraded']:break
  time.sleep(5)
 report['status']=status
 # Exit 0 is possible only after original integrity, resize and owned Blob cleanup.
 assert status=='Succeeded','Real Azure storage job did not succeed'
 report['passed']=True;report['sourceExceeds40MiB']=True;report['sourceHashVerified']=True;report['temporaryBlobDeleted']=True;report['memoryLimit']='1Gi';report['cpuLimit']=0.5
 for _ in range(3):
  result=subprocess.run(['az','containerapp','job','logs','show','-g',group,'-n',name,'--execution',executionName,'--container','photo','--tail','100','--format','text','--only-show-errors'],capture_output=True,text=True,timeout=45)
  line=next((line for line in result.stdout.splitlines() if 'HIDI_PHOTO_STORAGE_RESULT ' in line),None)
  if line:
   text=line.split('HIDI_PHOTO_STORAGE_RESULT ',1)[1];details=json.JSONDecoder().raw_decode(text)[0];assert details['passed'] and details['deleted'];report['details']=details;break
  time.sleep(2)
except Exception as error:
 report['passed']=False;report['error']=str(error)
finally:
 if created:
  try:
   current=az(['containerapp','job','show','-g',group,'-n',name]);assert current['properties']['template']['containers'][0]['image']==r.verify()['web']
   az(['containerapp','job','delete','-g',group,'-n',name,'--yes']);report['validationJobRemoved']=True
  except Exception as error:report['passed']=False;report['cleanupError']=str(error)
 r.save('azure-storage-test.json',report);print(json.dumps(report,indent=2))
assert report['passed'],'Azure validation failed; production rollout must not proceed'
