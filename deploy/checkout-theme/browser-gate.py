"""Reuse successful browser evidence only when every tested input is identical."""
import json, os, pathlib, re, subprocess, urllib.request

BASELINE = '2c81de1a2665f2ced5285c2071b683a2057dfd01'
RUN_ID = 38045636956
WORKFLOW = '.github/workflows/checkout-theme-release.yml'
REQUIRED = ['Install unchanged dependencies and generate existing SQL client', 'Run complete service and frontend regression', 'Build the storefront with retained public auth configuration', 'Verify desktop, mobile, cart, checkout and admin in three engines']
# These release-only files cannot change the application build or source fixtures.
RELEASE_FILES = {WORKFLOW, 'deploy/checkout-theme-release.py', 'deploy/checkout-theme-probes.mjs', 'deploy/checkout-theme-candidate.mjs', 'deploy/checkout-theme/runtime-compat.py', 'deploy/checkout-theme/browser-gate.py', '.github/workflows/cod-rewards-release.yml', 'deploy/cod-rewards-browser-gate.py', 'deploy/cod-rewards-probes.mjs', 'deploy/cod-rewards-release.py'}

def git(*args):
    return subprocess.check_output(['git', *args], text=True)

def get(url):
    request = urllib.request.Request(url, headers={'Accept': 'application/vnd.github+json', 'Authorization': 'Bearer ' + os.environ['GITHUB_TOKEN'], 'X-GitHub-Api-Version': '2022-11-28'})
    with urllib.request.urlopen(request, timeout=30) as response:
        return json.load(response)

def tested_commands(workflow):
    env = re.search(r'^    env:\n([\s\S]*?)^    steps:', workflow, re.M)
    assert env, 'Missing build environment'
    commands = [env.group(1)]
    for name in REQUIRED:
        section = workflow.split('      - name: ' + name + '\n', 1)[1].split('\n      - ', 1)[0]
        commands.append(section.split('        run: ', 1)[1])
    return commands

reuse = False
report = {'baselineRunId': RUN_ID, 'baselineCommit': BASELINE, 'candidateAndLiveChecksRequired': True}
try:
    changes = git('diff', '--name-only', BASELINE, 'HEAD').splitlines()
    assert not set(changes) - RELEASE_FILES, 'Application, dependency, configuration or test inputs changed'
    assert tested_commands(git('show', BASELINE + ':' + WORKFLOW)) == tested_commands(pathlib.Path(WORKFLOW).read_text()), 'Test commands or build environment changed'
    base = 'https://api.github.com/repos/HIDIfashions/HIDI-ecommerce/actions/runs/' + str(RUN_ID)
    run = get(base)
    assert run['status'] == 'completed' and run['head_sha'] == BASELINE
    job = next(item for item in get(base + '/jobs')['jobs'] if item['name'] == 'regression-and-release')
    steps = {item['name']: item['conclusion'] for item in job['steps']}
    assert all(steps.get(name) == 'success' for name in REQUIRED), 'Previous complete regression is not successful'
    assert steps.get('Deploy and run live regression within automatic rollback boundary') == 'skipped', 'Baseline already attempted rollout'
    reuse = True
    report.update(applicationBuildAndTestInputsIdentical=True, requiredSuccessfulSteps=REQUIRED, changedReleaseFiles=changes)
except Exception as error:
    report['refreshReason'] = str(error)
    print('Refreshing all browser checks: ' + str(error), flush=True)
report['reuse'] = reuse
output = pathlib.Path('evidence/checkout-theme'); output.mkdir(parents=True, exist_ok=True)
(output / 'browser-gate-reuse.json').write_text(json.dumps(report, indent=2))
with open(os.environ['GITHUB_OUTPUT'], 'a') as stream:
    stream.write('reuse=' + str(reuse).lower() + '\n')
print('Completed matching browser evidence verified; fresh candidate and live gates remain mandatory' if reuse else 'Full browser regression required', flush=True)
