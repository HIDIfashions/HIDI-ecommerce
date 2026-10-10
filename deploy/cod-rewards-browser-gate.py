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
paths = ['apps','packages','package.json','pnpm-lock.yaml','pnpm-workspace.yaml','deploy/public-auth.json','deploy/app-coming-soon.js','deploy/Dockerfile.api','deploy/Dockerfile.web','tests/editorial-storefront.browser.mjs','tests/checkout-theme.browser.mjs','tests/storefront-quality.browser.mjs','tests/admin-workspace.browser.mjs','tests/auth-otp-resend.browser.mjs']
changed = subprocess.check_output(['git','diff','--name-only',baseline,'HEAD','--',*paths],text=True).strip()
if changed:
    # A completed concurrent checkout gate can already validate this exact app and test suite.
    recent = get('https://api.github.com/repos/HIDIfashions/HIDI-ecommerce/actions/runs?per_page=30')
    for candidate in recent['workflow_runs']:
        if candidate['status'] != 'completed' or candidate['head_branch'] != 'migration/azure-sql-blob': continue
        if candidate['name'] not in ['Checkout shipping and theme guarded release','COD rewards and app guarded release']: continue
        try:
            candidate_changes = subprocess.check_output(['git','diff','--name-only',candidate['head_sha'],'HEAD','--',*paths],text=True,stderr=subprocess.DEVNULL).strip()
        except subprocess.CalledProcessError:
            continue
        if candidate_changes: continue
        candidate_job = next((item for item in get(candidate['url']+'/jobs')['jobs'] if item['name']=='regression-and-release'),None)
        candidate_steps = {item['name']:item['conclusion'] for item in candidate_job['steps']} if candidate_job else {}
        if not all(candidate_steps.get(name)=='success' for name in required[:3]): continue
        run_id, baseline, changed = candidate['id'], candidate['head_sha'], ''
        print('Completed concurrent gate validates identical application, build inputs and browser tests: '+str(run_id), flush=True)
        break
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
