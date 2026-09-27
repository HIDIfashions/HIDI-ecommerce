#!/usr/bin/env bash
set -euo pipefail
: "${HIDI_IMAGE_TAG:?Set HIDI_IMAGE_TAG to the verified GitHub commit SHA}"
rg=rg-hidi-prod
subscription=91d9572d-0f0b-47fe-802d-0eef36d7c719
base="/subscriptions/$subscription/resourceGroups/$rg"
identity="$base/providers/Microsoft.ManagedIdentity/userAssignedIdentities/id-hidi-migration"
image="acrhidiprod0927.azurecr.io/hidi-api:$HIDI_IMAGE_TAG"
python3 - "$HIDI_IMAGE_TAG" <<'HIDI_JOB_JSON'
import json,sys
base='/subscriptions/91d9572d-0f0b-47fe-802d-0eef36d7c719/resourceGroups/rg-hidi-prod'
identity=base+'/providers/Microsoft.ManagedIdentity/userAssignedIdentities/id-hidi-migration'
env={'AZURE_CLIENT_ID':'953bff4d-4a18-4679-ae55-f301dec0377e','AZURE_SQL_SERVER':'sql-hidi-prod-0927.database.windows.net','AZURE_SQL_DATABASE':'hidi-sql-validation','AZURE_STORAGE_ACCOUNT':'sthidiprod0927','MIGRATION_SNAPSHOT_BLOB':'snapshot-20260927.json','MIGRATION_SNAPSHOT_SHA256':'d9aaecf74dc88fef5ce3c24843a8b6e6240288018c67bd63a2e76414e1dcd772','API_PRINCIPAL_ID':'6d7ed735-19ac-45ed-a4d5-fb2fdcf13267'}
job={'location':'centralindia','identity':{'type':'UserAssigned','userAssignedIdentities':{identity:{}}},'properties':{'environmentId':base+'/providers/Microsoft.App/managedEnvironments/cae-hidi-prod','configuration':{'triggerType':'Manual','replicaTimeout':1200,'replicaRetryLimit':0,'manualTriggerConfig':{'parallelism':1,'replicaCompletionCount':1},'registries':[{'server':'acrhidiprod0927.azurecr.io','identity':identity}]},'template':{'containers':[{'name':'migration','image':'acrhidiprod0927.azurecr.io/hidi-api:'+sys.argv[1],'command':['/bin/sh','-c'],'args':['node scripts/azure/migrate.mjs bootstrap && node scripts/azure/migrate.mjs import && node scripts/azure/validate-prisma.mjs && node scripts/azure/migrate.mjs grant-runtime && node scripts/azure/media.mjs'],'env':[{'name':k,'value':v} for k,v in env.items()],'resources':{'cpu':0.5,'memory':'1Gi'}}]}}}
with open('/tmp/hidi-validation-job.json','w') as f:json.dump(job,f)
HIDI_JOB_JSON
az containerapp job create -g "$rg" -n job-hidi-validation --yaml /tmp/hidi-validation-job.json --query '{name:name,state:properties.provisioningState}' -o json
restore_admin() {
  az sql server ad-admin update -g "$rg" -s sql-hidi-prod-0927 --display-name 'Fashions hidi' \
    --object-id 055e30fe-d869-44a1-bb1a-12a3fe1bd311 --query '{login:login,sid:sid}' -o json
}
trap restore_admin EXIT
az sql server ad-admin update -g "$rg" -s sql-hidi-prod-0927 --display-name id-hidi-migration \
  --object-id b49dd6ab-8bc9-4c5c-a713-eff4351a1047 --query login -o tsv
execution=$(az containerapp job start -g "$rg" -n job-hidi-validation --query name -o tsv)
printf 'Migration execution: %s\n' "$execution"
status=Running
for attempt in $(seq 1 100); do
  status=$(az containerapp job execution list -g "$rg" -n job-hidi-validation --query "[?name=='$execution'].properties.status | [0]" -o tsv)
  if [ "$status" = Succeeded ] || [ "$status" = Failed ]; then break; fi
  sleep 10
done
printf 'Migration status: %s\n' "$status"
container=$(az containerapp job show -g "$rg" -n job-hidi-validation --query 'properties.template.containers[0].name' -o tsv)
az containerapp job logs show -g "$rg" -n job-hidi-validation --execution "$execution" --container "$container" --tail 100 --format text || true
[ "$status" = Succeeded ]
