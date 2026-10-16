#!/usr/bin/env bash
set -euo pipefail
: "${HIDI_IMAGE_TAG:?Set the verified container image commit SHA}"
: "${HIDI_PUBLIC_AUTH_FILE:=$HOME/public-auth.json}"
export HIDI_PUBLIC_AUTH_FILE HIDI_IMAGE_TAG
python3 - <<'PY'
import json,os
base='/subscriptions/91d9572d-0f0b-47fe-802d-0eef36d7c719/resourceGroups/rg-hidi-prod'
environment=base+'/providers/Microsoft.App/managedEnvironments/cae-hidi-prod'
identity=base+'/providers/Microsoft.ManagedIdentity/userAssignedIdentities/id-hidi-api'
with open(os.environ['HIDI_PUBLIC_AUTH_FILE']) as f:auth=json.load(f)
env={'AZURE_CLIENT_ID':'e3aab1a2-57bc-4167-a63e-cf27361425b1','AZURE_SQL_SERVER':'sql-hidi-prod-0927.database.windows.net','AZURE_SQL_DATABASE':'hidi-sql-validation','MIGRATION_READ_ONLY':'true','API_PORT':'4000','WEB_ORIGIN':'https://hidi-web.delightfulstone-4c9a3791.centralindia.azurecontainerapps.io','REVIEW_FOLLOWUP_ENABLED':'false','HIDI_WALLET_ENABLED':'false',**auth}
probes=[{'type':'Startup','httpGet':{'path':'/v1/health','port':4000},'initialDelaySeconds':5,'periodSeconds':10,'failureThreshold':30},{'type':'Readiness','httpGet':{'path':'/v1/health/ready','port':4000},'periodSeconds':10,'failureThreshold':3},{'type':'Liveness','httpGet':{'path':'/v1/health','port':4000},'periodSeconds':20,'failureThreshold':3}]
app={'location':'centralindia','identity':{'type':'UserAssigned','userAssignedIdentities':{identity:{}}},'properties':{'managedEnvironmentId':environment,'configuration':{'activeRevisionsMode':'Single','ingress':{'external':False,'targetPort':4000,'transport':'http','allowInsecure':False},'registries':[{'server':'acrhidiprod0927.azurecr.io','identity':identity}]},'template':{'containers':[{'name':'api','image':'acrhidiprod0927.azurecr.io/hidi-api:'+os.environ['HIDI_IMAGE_TAG'],'env':[{'name':k,'value':v} for k,v in env.items()],'resources':{'cpu':0.5,'memory':'1Gi'},'probes':probes}],'scale':{'minReplicas':1,'maxReplicas':2,'rules':[{'name':'http','http':{'metadata':{'concurrentRequests':'50'}}}]}}}}
with open('/tmp/hidi-api-preview.json','w') as f:json.dump(app,f)
PY
az containerapp create -g rg-hidi-prod -n hidi-api --yaml /tmp/hidi-api-preview.json --query '{name:name,state:properties.provisioningState,fqdn:properties.configuration.ingress.fqdn}' -o json
HIDI_INTERNAL_API=$(az containerapp show -g rg-hidi-prod -n hidi-api --query properties.configuration.ingress.fqdn -o tsv)
export HIDI_INTERNAL_API
python3 - <<'PY'
import json,os
base='/subscriptions/91d9572d-0f0b-47fe-802d-0eef36d7c719/resourceGroups/rg-hidi-prod'
identity=base+'/providers/Microsoft.ManagedIdentity/userAssignedIdentities/id-hidi-web'
api='https://'+os.environ['HIDI_INTERNAL_API']+'/v1'
media='https://hidi-web.delightfulstone-4c9a3791.centralindia.azurecontainerapps.io/media'
env={'AZURE_CLIENT_ID':'f6bc0caf-e7bb-473f-9ec8-072ec74660d1','AZURE_STORAGE_ACCOUNT':'sthidiprod0927','MEDIA_STORAGE_PROVIDER':'azure','MEDIA_PUBLIC_BASE_URL':media,'API_URL':api,'INTERNAL_API_URL':api,'DEPLOYMENT_STAGE':'validation','PORT':'3000','HOSTNAME':'0.0.0.0'}
probes=[{'type':'Startup','httpGet':{'path':'/healthz','port':3000},'initialDelaySeconds':5,'periodSeconds':10,'failureThreshold':30},{'type':'Readiness','httpGet':{'path':'/healthz','port':3000},'periodSeconds':10,'failureThreshold':3},{'type':'Liveness','httpGet':{'path':'/healthz','port':3000},'periodSeconds':20,'failureThreshold':3}]
app={'location':'centralindia','identity':{'type':'UserAssigned','userAssignedIdentities':{identity:{}}},'properties':{'managedEnvironmentId':base+'/providers/Microsoft.App/managedEnvironments/cae-hidi-prod','configuration':{'activeRevisionsMode':'Single','ingress':{'external':True,'targetPort':3000,'transport':'http','allowInsecure':False},'registries':[{'server':'acrhidiprod0927.azurecr.io','identity':identity}]},'template':{'containers':[{'name':'web','image':'acrhidiprod0927.azurecr.io/hidi-web:'+os.environ['HIDI_IMAGE_TAG'],'env':[{'name':k,'value':v} for k,v in env.items()],'resources':{'cpu':0.5,'memory':'1Gi'},'probes':probes}],'scale':{'minReplicas':1,'maxReplicas':2,'rules':[{'name':'http','http':{'metadata':{'concurrentRequests':'50'}}}]}}}}
with open('/tmp/hidi-web-preview.json','w') as f:json.dump(app,f)
PY
az containerapp create -g rg-hidi-prod -n hidi-web --yaml /tmp/hidi-web-preview.json --query '{name:name,state:properties.provisioningState,fqdn:properties.configuration.ingress.fqdn}' -o json
