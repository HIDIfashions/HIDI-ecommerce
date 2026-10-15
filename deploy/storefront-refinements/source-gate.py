"""Require the standard same-commit build to pass before any production update."""
import json,os,re,time,urllib.request
repository=os.environ['GITHUB_REPOSITORY'];sha=os.environ['GITHUB_SHA']
assert repository.lower()=='hidifashions/hidi-ecommerce' and re.fullmatch('[0-9a-f]{40}',sha)
token=os.environ['GITHUB_TOKEN']
url='https://api.github.com/repos/'+repository+'/actions/runs?head_sha='+sha+'&per_page=100'
for _ in range(90):
 request=urllib.request.Request(url,headers={'Authorization':'Bearer '+token,'Accept':'application/vnd.github+json','User-Agent':'HIDI-guarded-release'})
 with urllib.request.urlopen(request,timeout=30) as response:data=json.load(response)
 runs=[run for run in data['workflow_runs'] if run['name']=='Azure migration build' and run['head_sha']==sha and run['event']=='push']
 if runs and all(run['status']=='completed' for run in runs):
  assert all(run['conclusion']=='success' for run in runs),'Standard same-commit source/container build failed; no deployment permitted'
  print('PASS: standard source, browser and both container builds passed for the exact release commit');break
 time.sleep(10)
else:raise RuntimeError('Standard same-commit checks did not complete; no deployment permitted')
