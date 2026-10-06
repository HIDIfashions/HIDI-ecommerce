#!/usr/bin/env bash
# Updates existing application images only. No resource creation, migrations, DNS, users or role grants.
set -Eeuo pipefail
sha=${1:?Commit SHA required}
web_sha=${2:-$sha}
[[ "$sha" =~ ^[0-9a-f]{40}$ && "$web_sha" =~ ^[0-9a-f]{40}$ ]] || { echo 'Invalid image tag'; exit 2; }
group=rg-hidi-prod
registry=acrhidiprod0927.azurecr.io
base=https://thidigk.thehidi.com
work=$(mktemp -d)
changed=()
target_image() {
  if [[ "$1" == hidi-web ]]; then echo "$registry/$1:$web_sha"; else echo "$registry/$1:$sha"; fi
}
snapshot() {
  az containerapp show -g "$group" -n "$1" --only-show-errors \
    --query '{image:properties.template.containers[0].image,containers:length(properties.template.containers),mode:properties.configuration.activeRevisionsMode,latest:properties.latestRevisionName,ready:properties.latestReadyRevisionName,traffic:properties.configuration.ingress.traffic}' -o json
}
wait_ready() {
  for attempt in $(seq 1 60); do
    snapshot "$1" > "$work/current.json"
    if jq -e '.latest != null and .latest == .ready' "$work/current.json" >/dev/null; then return 0; fi
    sleep 10
  done
  echo "Readiness timeout for $1"; return 1
}
rollback() {
  code=$?; trap - ERR
  echo 'Validation failed; restoring only images changed by this run.'
  for ((i=${#changed[@]}-1; i>=0; i--)); do
    app=${changed[$i]}
    current=$(az containerapp show -g "$group" -n "$app" --query 'properties.template.containers[0].image' -o tsv --only-show-errors) || continue
    [[ "$current" == "$(target_image "$app")" ]] || { echo "$app changed by another deployment; refusing to overwrite it."; continue; }
    prior=$(jq -r .image "$work/$app.json")
    az containerapp update -g "$group" -n "$app" --image "$prior" --only-show-errors -o none || continue
    wait_ready "$app" || continue
    if [[ $(jq -r .mode "$work/$app.json") == Multiple ]]; then
      target=$(jq -r '.traffic[0] | if .latestRevision then "latest" else .revisionName end' "$work/$app.json")
      az containerapp ingress traffic set -g "$group" -n "$app" --revision-weight "$target=100" --only-show-errors -o none || true
    fi
  done
  rm -rf "$work"; exit "$code"
}
# Both apps must already exist and have a stable, simple deployment topology before any write.
for app in hidi-api hidi-web; do
  snapshot "$app" > "$work/$app.json"
  jq -e '.containers == 1 and (.mode == "Single" or .mode == "Multiple") and .latest == .ready and .ready != null' "$work/$app.json" >/dev/null || { echo "Unexpected or unsettled topology for $app; no apps changed."; exit 3; }
  if [[ $(jq -r .mode "$work/$app.json") == Multiple ]]; then
    jq -e '.traffic | length == 1 and .[0].weight == 100 and (.[0].label == null)' "$work/$app.json" >/dev/null || { echo "Existing canary/label traffic for $app needs a dedicated rollout; no apps changed."; exit 3; }
  fi
  prior_image=$(jq -r .image "$work/$app.json")
  tag_prefix="$registry/$app:"
  digest_prefix="$registry/$app@sha256:"
  if [[ "$prior_image" == "$tag_prefix"* ]]; then
    prior_sha=${prior_image#"$tag_prefix"}
    desired_image=$(target_image "$app")
    desired_sha=${desired_image#"$tag_prefix"}
    [[ "$prior_sha" =~ ^[0-9a-f]{40}$ ]] && git merge-base --is-ancestor "$prior_sha" "$desired_sha" || { echo "Refusing to overwrite newer or unrelated $app code; no apps changed."; exit 3; }
  elif [[ "$app" == hidi-web && "$prior_image" == "$digest_prefix"* ]]; then
    echo "Existing $app uses an ACR digest image; rollback image captured."
  else
    echo "Unknown image registry for $app; no apps changed."; exit 3
  fi
  echo "Existing $app verified. Image: $prior_image"
done
trap rollback ERR
for app in hidi-api hidi-web; do
  current=$(az containerapp show -g "$group" -n "$app" --query 'properties.template.containers[0].image' -o tsv --only-show-errors)
  [[ "$current" == "$(jq -r .image "$work/$app.json")" ]] || { echo "$app changed after preflight; refusing overwrite."; false; }
  changed+=("$app")
  if [[ "$app" == hidi-api ]]; then
    az containerapp update -g "$group" -n "$app" \
      --image "$(target_image "$app")" \
      --set-env-vars CUSTOMER_OTP_PROVIDER=firebase FIREBASE_PROJECT_ID=hidi-dee0f \
      --only-show-errors -o none
  else
    az containerapp update -g "$group" -n "$app" --image "$(target_image "$app")" --only-show-errors -o none
  fi
  wait_ready "$app"
  if [[ $(jq -r .mode "$work/$app.json") == Multiple ]]; then
    revision=$(jq -r .ready "$work/current.json")
    az containerapp ingress traffic set -g "$group" -n "$app" --revision-weight "$revision=100" --only-show-errors -o none
  fi
done
verified=false
for attempt in $(seq 1 18); do
  html=$(curl --silent --show-error --max-time 20 "$base/admin") || html=''
  status=$(curl --silent --show-error --max-time 20 -o /dev/null -w '%{http_code}' -H 'Cookie: hidi_admin_access=invalid-deployment-probe' "$base/api/admin/dashboard/overview") || status=000
  if [[ "$html" == *'data-hidi-admin-workspace="v1"'* && "$status" == 401 ]]; then verified=true; break; fi
  sleep 10
done
$verified || { echo 'New admin marker or protected API check failed'; false; }
trap - ERR
rm -rf "$work"
echo 'Updated existing hidi-api and hidi-web. Validation-domain admin and authentication boundary verified.'
echo 'No new Azure resources, database changes, DNS changes, staff accounts, orders or refunds.'
