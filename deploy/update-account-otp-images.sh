#!/usr/bin/env bash
# Image-only rollout; refuse source/image/settings drift and roll back only owned images.
set -Eeuo pipefail
expected_api=${1:?Expected API image required}
expected_web=${2:?Expected web image required}
api_image=${3:?Verified candidate API digest required}
web_image=${4:?Verified candidate web digest required}
baseline=${HIDI_OTP_BASELINE_STATE_DIR:?Fresh private Azure baseline required}
deadline=${HIDI_OTP_JOB_DEADLINE_EPOCH:?Workflow deadline required}
[[ "$deadline" =~ ^[0-9]+$ ]]
group=rg-hidi-prod
base=https://thidigk.thehidi.com
work=${RUNNER_TEMP:?RUNNER_TEMP required}/account-otp-rollout
mkdir -p "$work"
chmod 700 "$work"
for image in "$expected_api" "$expected_web" "$api_image" "$web_image"; do [[ "$image" =~ ^acrhidiprod0927\.azurecr\.io/hidi-(api|web)@sha256:[0-9a-f]{64}$ ]]; done
[[ "$expected_api" == *'/hidi-api@'* && "$api_image" == *'/hidi-api@'* && "$expected_web" == *'/hidi-web@'* && "$web_image" == *'/hidi-web@'* ]]
changed=()
snapshot() {
  python3 - "$1" <<'PY'
import json,subprocess,sys
from deploy.account_otp_release_guard import snapshot
result=subprocess.run(['az','containerapp','show','-g','rg-hidi-prod','-n',sys.argv[1],'--only-show-errors','-o','json'],capture_output=True,text=True)
if result.returncode: raise SystemExit('Azure state read failed')
print(json.dumps(snapshot(json.loads(result.stdout))))
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
  code=${1:-$?}; trap - ERR INT TERM
  echo 'Account image validation failed; restoring images owned by this release.' >&2
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
  python3 - "$baseline/$app.json" "$work/before-$app.json" <<'PY'
import json,sys
from deploy.account_otp_release_guard import snapshot
before=snapshot(json.load(open(sys.argv[1]))); current=json.load(open(sys.argv[2]))
assert before==current, 'Live image, ready revision or settings changed after candidate preparation'
PY
done
trap rollback ERR
trap 'rollback 130' INT
trap 'rollback 143' TERM
# Two readiness waits and two possible rollback waits need up to forty minutes.
# Reserve another five minutes for read-only probes before the first cloud write.
(( deadline - $(date +%s) >= 45 * 60 )) || { echo 'Insufficient workflow time remains for a guarded rollout and rollback' >&2; false; }
for app in hidi-api hidi-web; do
  snapshot "$app" > "$work/pre-update-$app.json"
  jq -e '.mode == "Single" and .latest == .ready and .ready != null' "$work/pre-update-$app.json" >/dev/null
  [[ "$(jq -r .image "$work/pre-update-$app.json")" == "$(expected "$app")" && "$(jq -r .settingsHash "$work/pre-update-$app.json")" == "$(jq -r .settingsHash "$work/before-$app.json")" ]]
  changed+=("$app")
  az containerapp update -g "$group" -n "$app" --image "$(target "$app")" --only-show-errors -o none
  wait_ready "$app"
  [[ "$(jq -r .image "$work/current-$app.json")" == "$(target "$app")" && "$(jq -r .settingsHash "$work/current-$app.json")" == "$(jq -r .settingsHash "$work/before-$app.json")" ]]
done
curl -fsS --max-time 30 "$base/health" >/dev/null
curl -fsS --max-time 30 "$base/" >/dev/null
curl -fsS --max-time 30 "$base/api/store/health/ready" >/dev/null
curl -fsS --max-time 30 "$base/api/store/auth/config" | python3 -c 'import json,sys; assert json.load(sys.stdin)=={"phoneOtp":True,"channel":"SMS","provider":"msg91","fallbackProvider":"firebase"}'
curl -fsS --max-time 30 "$base/account/policy" | python3 -c 'import sys; x=sys.stdin.read(); assert "Account terms &amp; privacy notice" in x and "id=\"terms\"" in x and "id=\"privacy\"" in x'
for path in /account /admin/landing-media /admin/packing-scanner /admin/products/price-tags; do
  status=$(curl -sS --max-time 30 -o /dev/null -w '%{http_code}' "$base$path")
  case "$status" in 200|301|302|303|307|308|401|403) ;; *) echo "Unexpected $path HTTP $status" >&2; false;; esac
done
status=$(curl -sS --max-time 30 -o /dev/null -w '%{http_code}' -H 'Cookie: hidi_admin_access=invalid-deployment-probe' "$base/api/admin/dashboard/overview")
[[ "$status" == 401 || "$status" == 403 ]]
for app in hidi-api hidi-web; do
  snapshot "$app" > "$work/final-$app.json"
  jq -e '.mode == "Single" and .latest == .ready and .ready != null' "$work/final-$app.json" >/dev/null
  [[ "$(jq -r .image "$work/final-$app.json")" == "$(target "$app")" && "$(jq -r .settingsHash "$work/final-$app.json")" == "$(jq -r .settingsHash "$work/before-$app.json")" ]]
done
trap - ERR INT TERM
echo 'Verified account images deployed; provider, secrets, environment, database, landing runtime and admin payloads preserved.'
