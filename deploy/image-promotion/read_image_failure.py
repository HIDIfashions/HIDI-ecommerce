"""Read-only, bounded diagnostics for the failed image release; no app or data writes."""
import json,subprocess,sys
from pathlib import Path
sys.path.insert(0,str(Path('../deploy/image-promotion').resolve()))
from immutable_image_promote import load_release,WEB
r=load_release()
report={'productionTrafficChanged':False,'databaseWrites':0,'blobWrites':0,'diagnosticErrors':{}}
expected=r.read('before.json')
rollback=r.read('promotion-rollback.json')
assert rollback['passed'] and rollback['apiUnchanged'] and rollback['state']['ready']=='hidi-web--rangefiverb39919863794a1'
expected['hidi-web']=rollback['state']
r.r.photo.unchanged(expected)
web=r.r.cloud.app('hidi-web')
revision='hidi-web--imageimmutable39919863794a1'
url='https://management.azure.com'+web['id']+'/revisions/'+revision+'?api-version=2025-07-01'

def attempt(label,fn):
    try:report[label]=fn()
    except Exception as error:report['diagnosticErrors'][label]=str(error)[-1600:]

def revision_state():
    data=r.r.cloud.azure('rest','--method','get','--url',url)
    props=data['properties']
    containers=props['template']['containers']
    assert containers[0]['image']==WEB
    return {**{key:props.get(key) for key in ['active','createdTime','healthState','provisioningState','runningState','runningStateDetails','replicas','trafficWeight']},'containers':[{'name':item['name'],'image':item['image'],'resources':item['resources']} for item in containers]}

attempt('failedRevision',revision_state)
def metrics():
    definitions=r.r.cloud.azure('monitor','metrics','list-definitions','--resource',web['id'])
    rows=[]
    for metric in ['WorkingSetBytes','RestartCount','Requests']:
        definition=next((d for d in definitions if d['name']['value']==metric),None)
        if not definition:continue
        dimensions=[d['value'] for d in definition.get('dimensions',[])]
        revision_dimension=next((d for d in dimensions if d.lower()=='revisionname'),None)
        args=['monitor','metrics','list','--resource',web['id'],'--metric',metric,'--start-time','2026-10-23T07:48:00Z','--end-time','2026-10-23T07:56:00Z','--interval','PT1M','--aggregation','Maximum' if metric!='Requests' else 'Total']
        if revision_dimension:args+=['--filter',revision_dimension+" eq '"+revision+"'"]
        try:rows.append({'metric':metric,'dimensions':dimensions,'result':r.r.cloud.azure(*args)})
        except Exception as error:rows.append({'metric':metric,'error':str(error)[-1200:]})
    return rows
attempt('metrics',metrics)
def system_logs():
    result=subprocess.run(['az','containerapp','logs','show','-g','rg-hidi-prod','-n','hidi-web','--type','system','--tail','100','--format','text','--only-show-errors'],capture_output=True,text=True,timeout=45)
    assert result.returncode==0,result.stderr[-1200:]
    return [line[:1500] for line in result.stdout.splitlines() if revision in line or any(term in line.lower() for term in ['oom','out of memory','exit code','unhealthy','failed','error'])][-60:]
attempt('systemLogs',system_logs)
r.r.photo.unchanged(expected)
report['restoredProductionUnchanged']=True
report['restoredStates']=expected
r.save('live-upload-diagnostics.json',report)
print(json.dumps(report,indent=2))
