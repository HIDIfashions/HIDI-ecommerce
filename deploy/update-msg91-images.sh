#!/usr/bin/env bash
# Roll out prepared images only. Auth keys, provider, database and every other setting stay unchanged.
set -Eeuo pipefail
expected_api=${1:?Expected API image required}
expected_web=${2:?Expected web image required}
api_image=${3:?Verified candidate API digest required}
web_image=${4:?Verified candidate web digest required}
group=rg-hidi-prod
base=https://thidigk.thehidi.com
work=${RUNNER_TEMP:?RUNNER_TEMP required}/hidi-msg91-rollout
mkdir -p "$work"
chmod 700 "$work"
for image in "$api_image" "$web_image"; do [[ "$image" =~ ^acrhidiprod0927\.azurecr\.io/hidi-(api|web)@sha256:[0-9a-f]{64}$ ]]; done
[[ "$api_image" == *'/hidi-api@'* && "$web_image" == *'/hidi-web@'* ]]
changed=()
snapshot() {
  python3 - "$1" <<'PY'
import copy,hashlib,json,subprocess,sys
result=subprocess.run(['az','containerapp','show','-g','rg-hidi-prod','-n',sys.argv[1],'--only-show-errors','-o','json'],capture_output=True,text=True)
if result.returncode: raise SystemExit('Azure state read failed')
data=json.loads(result.stdout); p=data['properties']; containers=p['template']['containers']
assert len(containers)==1, 'Expected one application container'
template=copy.deepcopy(p['template']); template.pop('revisionSuffix',None); template['containers'][0].pop('image',None)
template['containers'][0]['env']=sorted(template['containers'][0].get('env',[]),key=lambda x:x['name'])
configuration=copy.deepcopy(p['configuration']); configuration.get('ingress',{}).pop('traffic',None)
settings={'template':template,'configuration':configuration,'identity':data.get('identity',{})}
print(json.dumps({'image':containers[0]['image'],'mode':p['configuration']['activeRevisionsMode'],'latest':p['latestRevisionName'],'ready':p.get('latestReadyRevisionName'),'settingsHash':hashlib.sha256(json.dumps(settings,sort_keys=True).encode()).hexdigest()}))
PY
}
target() { if [[ "$1" == hidi-api ]]; then echo "$api_image"; else echo "$web_image"; fi; }
expected() { if [[ "$1" == hidi-api ]]; then echo "$expected_api"; else echo "$expected_web"; fi; }
wait_ready() {
  for attempt in $(seq 1 60); do
    snapshot "$1" > "$work/current-$1.json"
    jq -e '.latest != null and .latest == .ready' "$work/current-$1.json" >/dev/null && return 0
    sleep 10
  done
  echo "$1 did not become ready" >&2; return 1
}
rollback() {
  code=$?; trap - ERR
  echo 'SMS image validation failed; restoring images owned by this release.' >&2
  for ((i=${#changed[@]}-1;i>=0;i--)); do
    app=${changed[$i]}
    snapshot "$app" > "$work/rollback-current-$app.json" || continue
    [[ "$(jq -r .image "$work/rollback-current-$app.json")" == "$(target "$app")" && "$(jq -r .settingsHash "$work/rollback-current-$app.json")" == "$(jq -r .settingsHash "$work/before-$app.json")" ]] || { echo "$app changed independently; refusing overwrite" >&2; continue; }
    az containerapp update -g "$group" -n "$app" --image "$(expected "$app")" --only-show-errors -o none || continue
    wait_ready "$app" || continue
  done
  exit "$code"
}
for app in hidi-api hidi-web; do
  snapshot "$app" > "$work/before-$app.json"
  jq -e '.mode == "Single" and .latest == .ready and .ready != null' "$work/before-$app.json" >/dev/null
  [[ "$(jq -r .image "$work/before-$app.json")" == "$(expected "$app")" ]] || { echo 'Another image release is active; refusing overwrite' >&2; exit 3; }
done
trap rollback ERR
for app in hidi-api hidi-web; do
  snapshot "$app" > "$work/pre-update-$app.json"
  [[ "$(jq -r .image "$work/pre-update-$app.json")" == "$(expected "$app")" && "$(jq -r .settingsHash "$work/pre-update-$app.json")" == "$(jq -r .settingsHash "$work/before-$app.json")" ]]
  changed+=("$app")
  az containerapp update -g "$group" -n "$app" --image "$(target "$app")" --only-show-errors -o none
  wait_ready "$app"
  [[ "$(jq -r .image "$work/current-$app.json")" == "$(target "$app")" && "$(jq -r .settingsHash "$work/current-$app.json")" == "$(jq -r .settingsHash "$work/before-$app.json")" ]]
done
curl -fsS --max-time 30 "$base/health" >/dev/null
curl -fsS --max-time 30 "$base/" >/dev/null
curl -fsS --max-time 30 "$base/api/store/auth/config" | python3 -c 'import json,sys; x=json.load(sys.stdin); assert x.get("phoneOtp") is True and x.get("provider") in {"firebase","msg91"}'
for path in /account /admin/landing-media /admin/packing-scanner /admin/products/price-tags; do
  status=$(curl -sS --max-time 30 -o /dev/null -w '%{http_code}' "$base$path")
  case "$status" in 200|301|302|303|307|308|401|403) ;; *) echo "Unexpected $path HTTP $status" >&2; false;; esac
done
status=$(curl -sS --max-time 30 -o /dev/null -w '%{http_code}' -H 'Cookie: hidi_admin_access=invalid-deployment-probe' "$base/api/admin/dashboard/overview")
[[ "$status" == 401 || "$status" == 403 ]]
trap - ERR
echo 'Verified SMS-capable images deployed. Provider, secrets, environment, landing runtime and administration overlays preserved.'
