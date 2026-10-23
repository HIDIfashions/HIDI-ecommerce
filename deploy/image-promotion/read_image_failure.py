"""Read-only, bounded diagnostics for the failed image release; no app or data writes."""
import json,subprocess,sys,re
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
    definitions=r.r.cloud.azure('monitor','metrics','list-definitions','--resource',web['id'],'--namespace','Microsoft.App/containerApps')
    report['metricDefinitions']=[d['name']['value'] for d in definitions]
    rows=[]
    for metric in ['WorkingSetBytes','RestartCount','Requests']:
        definition=next((d for d in definitions if d['name']['value'].lower()==metric.lower()),None)
        metric=definition['name']['value'] if definition else metric
        dimensions=[d['value'] for d in definition.get('dimensions',[])] if definition else ['revisionName']
        revision_dimension=next((d for d in dimensions if d.lower()=='revisionname'),'revisionName')
        args=['monitor','metrics','list','--resource',web['id'],'--namespace','Microsoft.App/containerApps','--metric',metric,'--start-time','2026-10-23T07:48:00Z','--end-time','2026-10-23T07:56:00Z','--interval','PT1M','--aggregation','Maximum' if metric!='Requests' else 'Total']
        if revision_dimension:args+=['--filter',revision_dimension+" eq '"+revision+"'"]
        try:rows.append({'metric':metric,'dimensions':dimensions,'result':r.r.cloud.azure(*args)})
        except Exception as error:rows.append({'metric':metric,'error':str(error)[-1200:]})
    return rows
attempt('metrics',metrics)
def system_logs():
    result=subprocess.run(['az','containerapp','logs','show','-g','rg-hidi-prod','-n','hidi-web','--type','system','--tail','100','--format','json','--only-show-errors'],capture_output=True,text=True,timeout=45)
    assert result.returncode==0,result.stderr[-1200:]
    return [line[:1500] for line in result.stdout.splitlines() if revision in line or any(term in line.lower() for term in ['oom','out of memory','exit code','unhealthy','failed','error'])][-60:]
attempt('systemLogs',system_logs)
def historical_logs():
    environment=web['properties'].get('environmentId') or web['properties']['managedEnvironmentId']
    data=r.r.cloud.azure('rest','--method','get','--url','https://management.azure.com'+environment+'?api-version=2025-07-01')
    config=data['properties'].get('appLogsConfiguration') or {}
    workspace=(config.get('logAnalyticsConfiguration') or {}).get('customerId')
    report['logDestination']=config.get('destination')
    if not workspace:
        settings=r.r.cloud.azure('rest','--method','get','--url','https://management.azure.com'+environment+'/providers/microsoft.insights/diagnosticSettings?api-version=2021-05-01-preview')
        targets={item['properties']['workspaceId'] for item in settings.get('value',[]) if item.get('properties',{}).get('workspaceId')}
        assert len(targets)==1,'A single existing Log Analytics destination was not found'
        workspace_data=r.r.cloud.azure('rest','--method','get','--url','https://management.azure.com'+next(iter(targets))+'?api-version=2023-09-01')
        workspace=workspace_data['properties']['customerId']
    assert re.fullmatch(r'[a-fA-F0-9-]{36}',workspace),'Invalid workspace identifier'
    report['logWorkspaceCustomerId']=workspace
    report['managedEnvironmentResourceId']=environment
    report['deploymentClientId']='3d62eb64-29dc-48ee-ab35-093312bd50af'
    def workspace_scope():
        rows=r.r.cloud.azure('monitor','log-analytics','workspace','list','-g','rg-hidi-prod')
        matches=[item for item in rows if str(item.get('customerId') or item.get('properties',{}).get('customerId','')).lower()==workspace.lower()]
        assert len(matches)==1,'Workspace scope not found in production resource group'
        return {'id':matches[0]['id'],'name':matches[0]['name']}
    attempt('logWorkspaceScope',workspace_scope)
    attempt('deploymentPrincipal',lambda:r.r.cloud.azure('ad','sp','show','--id',report['deploymentClientId'],'--query','{id:id,displayName:displayName,appId:appId}'))
    query="""union isfuzzy=true withsource=SourceTable ContainerAppSystemLogs_CL, ContainerAppConsoleLogs_CL, ContainerAppSystemLogs, ContainerAppConsoleLogs
| extend App=coalesce(column_ifexists('ContainerAppName_s',''),column_ifexists('ContainerAppName','')), Revision=coalesce(column_ifexists('RevisionName_s',''),column_ifexists('RevisionName','')), Message=coalesce(column_ifexists('Log_s',''),column_ifexists('Log',''))
| where TimeGenerated between (datetime(2026-10-23T07:48:00Z) .. datetime(2026-10-23T07:56:30Z))
| where App == 'hidi-web' and Revision == 'hidi-web--imageimmutable39919863794a1'
| where SourceTable contains 'System' or Message has_any ('memory','heap','Killed','SIGKILL','FATAL','Error','unhealthy','timeout')
| project TimeGenerated, SourceTable, Message=substring(Message,0,1500)
| order by TimeGenerated asc
| take 60"""
    rows=r.r.cloud.azure('monitor','log-analytics','query','--workspace',workspace,'--analytics-query',query)
    def redact(value):
        if isinstance(value,list):return [redact(item) for item in value]
        if isinstance(value,dict):return {key:redact(item) for key,item in value.items()}
        if isinstance(value,str) and re.search(r'authorization|bearer |password|secret|cookie|connectionstring|access.?token',value,re.I):return '[sensitive log content omitted]'
        return value

    base=query.split("| where TimeGenerated")[0]
    for label,start,end,rev in [
        ('candidateCompleteWindow','2026-10-23T07:48:00Z','2026-10-23T07:56:30Z','hidi-web--imageimmutable39919863794a1'),
        ('restoredTerminationWindow','2026-10-23T10:33:00Z','2026-10-23T10:38:00Z','hidi-web--rangefiverb39919863794a1')
    ]:
        expanded=base+f"""| where TimeGenerated between (datetime({start}) .. datetime({end}))
| where App == 'hidi-web' and Revision == '{rev}'
| extend Reason=coalesce(column_ifexists('Reason_s',''),column_ifexists('Reason','')), Type=coalesce(column_ifexists('Type_s',''),column_ifexists('Type',''))
| project TimeGenerated, SourceTable, Reason, Type, Message=substring(Message,0,2000)
| order by TimeGenerated asc
| take 120"""
        attempt(label,lambda q=expanded:redact(r.r.cloud.azure('monitor','log-analytics','query','--workspace',workspace,'--analytics-query',q)))
    return redact(rows)
attempt('historicalFailureLogs',historical_logs)

def current_health():
    results={}
    for path in ['/health','/healthz','/api/store/health/ready','/']:
        r.r.cloud.get(path)
        results[path]='PASS'
    for name,state in expected.items():
        app=r.r.cloud.app(name)
        props=r.r.cloud.azure('rest','--method','get','--url','https://management.azure.com'+app['id']+'/revisions/'+state['ready']+'?api-version=2025-07-01')['properties']
        results[name]={key:props.get(key) for key in ['healthState','runningState','replicas','trafficWeight']}
        assert props.get('healthState')=='Healthy' and props.get('runningState')=='Running',name+': current revision not healthy/running'
    return results
attempt('currentHealth',current_health)
r.r.photo.unchanged(expected)
report['restoredProductionUnchanged']=True
report['restoredStates']=expected
r.save('live-upload-diagnostics.json',report)
print(json.dumps(report,indent=2))

