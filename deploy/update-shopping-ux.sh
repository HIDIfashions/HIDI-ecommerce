#!/usr/bin/env bash
# Image-only deployment. Existing environment, secrets, identities, database and DNS stay in place.
set -Eeuo pipefail
sha=${1:?Release SHA required}
web_image=${2:?Combined web image required}
registry=acrhidiprod0927.azurecr.io
group=rg-hidi-prod
base=https://thidigk.thehidi.com
[[ "$sha" =~ ^[0-9a-f]{40}$ && "$web_image" =~ ^acrhidiprod0927\.azurecr\.io/hidi-web@sha256:[0-9a-f]{64}$ ]]
api_image="$registry/hidi-api:$sha"
work="${RUNNER_TEMP:-/tmp}/hidi-shopping-ux-state"
mkdir -p "$work"
changed=()
snapshot() {
  python3 - "$1" <<'PY'
import copy, hashlib, json, subprocess, sys
data=json.loads(subprocess.check_output(['az','containerapp','show','-g','rg-hidi-prod','-n',sys.argv[1],'--only-show-errors','-o','json'],text=True))
p=data['properties']; containers=p['template']['containers']; first=containers[0]
template=copy.deepcopy(p['template']); template.pop('revisionSuffix',None)
template['containers'][0].pop('image',None)
template['containers'][0]['env']=sorted(first.get('env',[]),key=lambda x:x['name'])
# Traffic follows each image's revision; other runtime and ingress settings must stay equal.
configuration=copy.deepcopy(p['configuration']); configuration.get('ingress',{}).pop('traffic',None)
settings={'template':template,'configuration':configuration,'identity':data.get('identity',{})}
print(json.dumps({'image':first['image'],'containers':len(containers),'mode':p['configuration']['activeRevisionsMode'],'latest':p['latestRevisionName'],'ready':p.get('latestReadyRevisionName'),'traffic':p['configuration'].get('ingress',{}).get('traffic',[]),'settingsHash':hashlib.sha256(json.dumps(settings,sort_keys=True).encode()).hexdigest()}))
PY
}
target_image() { if [[ "$1" == hidi-api ]]; then echo "$api_image"; else echo "$web_image"; fi; }
wait_ready() {
  for attempt in $(seq 1 60); do
    snapshot "$1" > "$work/current-$1.json"
    if jq -e '.latest != null and .latest == .ready' "$work/current-$1.json" >/dev/null; then return 0; fi
    sleep 10
  done
  echo "$1 did not become ready" >&2; return 1
}
rollback() {
  code=$?; trap - ERR
  echo 'Deployment validation failed; restoring only images owned by this release.' >&2
  for ((i=${#changed[@]}-1;i>=0;i--)); do
    app=${changed[$i]}
    snapshot "$app" > "$work/rollback-current-$app.json" || continue
    [[ "$(jq -r .image "$work/rollback-current-$app.json")" == "$(target_image "$app")" ]] || { echo "$app changed independently; refusing overwrite" >&2; continue; }
    az containerapp update -g "$group" -n "$app" --image "$(jq -r .image "$work/before-$app.json")" --only-show-errors -o none || continue
    wait_ready "$app" || continue
    if [[ "$(jq -r .mode "$work/before-$app.json")" == Multiple ]]; then
      revision=$(jq -r .ready "$work/current-$app.json")
      az containerapp ingress traffic set -g "$group" -n "$app" --revision-weight "$revision=100" --only-show-errors -o none || true
    fi
  done
  exit "$code"
}
# Confirm that rebuilding Next cannot silently introduce a different admin or authentication UI.
python3 - "$sha" <<'PY'
import json, subprocess, sys
release=json.load(open('deploy/shopping-ux-release.json'))
files=set(subprocess.check_output(['git','diff','--name-only',release['storefront_base'],sys.argv[1],'--','apps/web'],text=True).splitlines())
unexpected=files-set(release['storefront_files'])
if unexpected: raise SystemExit('Unreviewed storefront files: '+', '.join(sorted(unexpected)))
PY
for app in hidi-api hidi-web; do
  snapshot "$app" > "$work/before-$app.json"
  jq -e '.containers == 1 and (.mode == "Single" or .mode == "Multiple") and .latest == .ready and .ready != null' "$work/before-$app.json" >/dev/null
  if [[ "$(jq -r .mode "$work/before-$app.json")" == Multiple ]]; then
    jq -e '.traffic | length == 1 and .[0].weight == 100 and .[0].label == null' "$work/before-$app.json" >/dev/null
  fi
  prior_image=$(jq -r .image "$work/before-$app.json")
  [[ "$prior_image" == "$registry/$app:"* || "$prior_image" == "$registry/$app@sha256:"* ]]
  if [[ "$app" == hidi-api ]]; then
    prior_sha=${prior_image#"$registry/$app:"}
    [[ "$prior_sha" =~ ^[0-9a-f]{40}$ ]] && git merge-base --is-ancestor "$prior_sha" "$sha" || { echo 'API uses newer or unrelated code; refusing overwrite' >&2; exit 3; }
  fi
  echo "Rollback recorded: $app $prior_image"
done
trap rollback ERR
for app in hidi-api hidi-web; do
  snapshot "$app" > "$work/pre-update-$app.json"
  [[ "$(jq -r .image "$work/pre-update-$app.json")" == "$(jq -r .image "$work/before-$app.json")" && "$(jq -r .settingsHash "$work/pre-update-$app.json")" == "$(jq -r .settingsHash "$work/before-$app.json")" ]]
  changed+=("$app")
  az containerapp update -g "$group" -n "$app" --image "$(target_image "$app")" --only-show-errors -o none
  wait_ready "$app"
  [[ "$(jq -r .image "$work/current-$app.json")" == "$(target_image "$app")" && "$(jq -r .settingsHash "$work/current-$app.json")" == "$(jq -r .settingsHash "$work/before-$app.json")" ]]
  if [[ "$(jq -r .mode "$work/before-$app.json")" == Multiple ]]; then
    revision=$(jq -r .ready "$work/current-$app.json")
    az containerapp ingress traffic set -g "$group" -n "$app" --revision-weight "$revision=100" --only-show-errors -o none
  fi
done
python3 landing-source/deploy/hidi-web-new/smoke.py --url "$base" --dist landing-source/apps/web/dist
python3 landing-source/deploy/hidi-web-new/wiring-smoke.py --url "$base"
for path in /admin/landing-media /admin/packing-scanner /admin/products/price-tags; do
  status=$(curl -sS --max-time 30 -o /dev/null -w '%{http_code}' "$base$path")
  case "$status" in 200|301|302|303|307|308|401|403) ;; *) echo "Unexpected $path HTTP $status" >&2; false;; esac
done
status=$(curl -sS --max-time 30 -o /dev/null -w '%{http_code}' -H 'Cookie: hidi_admin_access=invalid-deployment-probe' "$base/api/admin/dashboard/overview")
[[ "$status" == 401 || "$status" == 403 ]]
trap - ERR
echo 'Shopping UX release healthy. Environment and identity hashes unchanged; rollback references saved.'
