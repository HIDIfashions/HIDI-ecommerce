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
if changed:
    print('Application or build inputs changed; refreshing the complete browser regression', flush=True)
    def check(command, extra):
        subprocess.run(command, env={**os.environ, **extra}, check=True)
    engines = {'HIDI_BROWSER_ENGINES':'chromium,firefox,webkit'}
    check(['timeout','180s','node','tests/editorial-storefront.browser.mjs'], {**engines,'HIDI_BROWSER_CASES':'FIX-04'})
    check(['timeout','1200s','node','tests/editorial-storefront.browser.mjs'], engines)
    for engine in ['chromium','firefox','webkit']:
        check(['timeout','240s','node','tests/admin-workspace.browser.mjs'], {'HIDI_BROWSER_ENGINE':engine})
    check(['timeout','600s','node','tests/auth-otp-resend.browser.mjs'], engines)
pathlib.Path('evidence/cod-rewards').mkdir(parents=True,exist_ok=True)
pathlib.Path('evidence/cod-rewards/browser-gate-reuse.json').write_text(json.dumps({'passed':True,'baselineRunId':run_id,'baselineCommit':baseline,'applicationAndBuildInputsIdentical':not bool(changed),'freshCompleteBrowserRegression':bool(changed),'changedInputs':changed.splitlines(),'requiredSuccessfulSteps':required,'candidateAndLiveChecksRequired':True},indent=2))
print('PASS: complete storefront, admin and sign-in browser regression '+('refreshed for the current application' if changed else 'verified against identical application code and build inputs')+'; fresh candidate and live checks remain required')
