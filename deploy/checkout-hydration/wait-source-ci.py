import json,os,time,urllib.request
from pathlib import Path
repo=os.environ['GITHUB_REPOSITORY'];sha=os.environ['GITHUB_SHA']
def get(path):
 request=urllib.request.Request('https://api.github.com/repos/'+repo+path,headers={'Authorization':'Bearer '+os.environ['GITHUB_TOKEN'],'Accept':'application/vnd.github+json'})
 with urllib.request.urlopen(request,timeout=30) as response:return json.load(response)
for attempt in range(100):
 runs=get('/actions/workflows/azure-build.yml/runs?head_sha='+sha+'&per_page=5')['workflow_runs']
 for run in runs:
  assert run['head_sha']==sha
  jobs=get('/actions/runs/'+str(run['id'])+'/jobs')['jobs']
  job=next((j for j in jobs if j['name']=='source-and-test'),None)
  if job and job['status']=='completed':
   assert job['conclusion']=='success','Complete source regression failed: '+job['html_url']
   out=Path('evidence/checkout-hydration-release');out.mkdir(parents=True,exist_ok=True)
   (out/'source-ci.json').write_text(json.dumps({'passed':True,'sourceSha':sha,'runId':run['id'],'jobId':job['id'],'url':job['html_url'],'allSourceGatesPassed':True},indent=2))
   print('PASS: exact-source full build, API, admin, homepage and three-engine storefront regression');raise SystemExit(0)
 print('Waiting for exact-source complete regression job',flush=True);time.sleep(20)
raise RuntimeError('Source regression did not complete before deployment gate deadline')
