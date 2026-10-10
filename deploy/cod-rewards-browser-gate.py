"""Reuse a completed browser gate only for identical application code and build inputs."""
import json, os, pathlib, subprocess, urllib.request

run_id = 38043089418
baseline = '53917b7d03688b2a673cecf6e812a5b17ec53910'
base = 'https://api.github.com/repos/HIDIfashions/HIDI-ecommerce/actions/runs/' + str(run_id)
def get(url):
    request = urllib.request.Request(url, headers={'Accept':'application/vnd.github+json','Authorization':'Bearer '+os.environ['GITHUB_TOKEN'],'X-GitHub-Api-Version':'2022-11-28'})
    with urllib.request.urlopen(request, timeout=30) as response: return json.load(response)
run = get(base)
assert run['status'] == 'completed' and run['head_sha'] == baseline
job = next(item for item in get(base+'/jobs')['jobs'] if item['name'] == 'regression-and-release')
steps = {item['name']: item['conclusion'] for item in job['steps']}
required = ['Run complete service and frontend regression','Build the storefront with retained public auth configuration','Verify desktop, mobile, cart, checkout and admin in three engines','Verify actual live wallet readiness without writes']
assert all(steps.get(name) == 'success' for name in required), 'Previous validation is incomplete'
assert steps.get('Deploy and run live regression within automatic rollback boundary') == 'skipped', 'Use only the pre-deployment baseline'
paths = ['apps','packages','package.json','pnpm-lock.yaml','pnpm-workspace.yaml','deploy/public-auth.json','deploy/app-coming-soon.js','deploy/Dockerfile.api','deploy/Dockerfile.web']
changed = subprocess.check_output(['git','diff','--name-only',baseline,'HEAD','--',*paths],text=True).strip()
assert not changed, 'Application code or build inputs changed; rerun the full browser gate'
pathlib.Path('evidence/cod-rewards').mkdir(parents=True,exist_ok=True)
pathlib.Path('evidence/cod-rewards/browser-gate-reuse.json').write_text(json.dumps({'passed':True,'baselineRunId':run_id,'baselineCommit':baseline,'applicationAndBuildInputsIdentical':True,'requiredSuccessfulSteps':required,'candidateAndLiveChecksRequired':True},indent=2))
print('PASS: completed storefront, admin and sign-in browser regression verified against identical application code and build inputs; fresh candidate and live checks remain required')
