"""Run independent release gates; never substitute a skipped gate for success."""
import subprocess, pathlib, json, os, re, time, csv
root=pathlib.Path.cwd(); out=root/'reports/image-complete'; out.mkdir(parents=True,exist_ok=True)
sha=subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip()
evidence={'testedCommit':sha,'runId':os.environ.get('GITHUB_RUN_ID','local'),'productionChanged':False,'suites':[],'cases':[],'unexecuted':['Authenticated Azure upload and resource test','Real catalogue colour/embroidery approval','Production deployment and live speed measurement']}
inventory={'agents':{},'packages':{},'testFiles':[],'nextGuides':{}}
for p in [root/'AGENTS.md',root/'apps/AGENTS.md',root/'apps/web/AGENTS.md',root/'apps/api/AGENTS.md']:
    if p.exists():inventory['agents'][str(p.relative_to(root))]=p.read_text()
for p in [root/'package.json',root/'apps/web/package.json',root/'apps/api/package.json']:inventory['packages'][str(p.relative_to(root))]=json.loads(p.read_text())
for folder in ['tests','deploy']:
    inventory['testFiles'] += [str(p.relative_to(root)) for p in (root/folder).rglob('*') if p.is_file() and ('.test.' in p.name or '.browser.' in p.name)]
docs=root/'apps/web/node_modules/next/dist/docs'
if docs.exists():
    for p in docs.rglob('*'):
        if p.is_file() and any(s in p.name.lower() for s in ['proxyclientmaxbodysize','proxy-client-max-body-size','route-handlers']):inventory['nextGuides'][str(p.relative_to(docs))]=p.read_text()[:20000]
(out/'inventory.json').write_text(json.dumps(inventory,indent=2))
auth=json.loads((root/'deploy/public-auth.json').read_text())
for key in ['SUPABASE_URL','SUPABASE_PUBLISHABLE_KEY','CUSTOMER_AUTH_PROVIDER','CUSTOMER_OTP_CHANNEL','FIREBASE_API_KEY','FIREBASE_AUTH_DOMAIN','FIREBASE_PROJECT_ID','FIREBASE_APP_ID','FIREBASE_MESSAGING_SENDER_ID','FIREBASE_STORAGE_BUCKET']:
    os.environ['NEXT_PUBLIC_'+key]=str(auth.get(key,auth.get('NEXT_PUBLIC_'+key,'')))
os.environ['HIDI_BROWSER_ENGINES']='chromium,firefox,webkit'
def run(name,cmd,timeout=600,requires=None):
    if requires is not None and not requires:
        evidence['suites'].append({'name':name,'status':'BLOCKED','reason':'Required application build failed','command':cmd});return False
    start=time.monotonic()
    try:
        r=subprocess.run(['bash','-o','pipefail','-c',cmd],stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True,timeout=timeout)
        text=r.stdout;code=r.returncode
    except subprocess.TimeoutExpired as e:
        text=e.stdout or b'';text=text.decode(errors='replace') if isinstance(text,bytes) else text;code=124
    (out/(name+'.log')).write_text(text)
    cases=[]
    for line in text.splitlines():
        m=re.match(r'^(not )?ok\s+(\d+)\s+-\s+(.*)',line)
        if m:cases.append({'suite':name,'case':m[3],'status':'SKIP' if '# SKIP' in m[3] else ('FAIL' if m[1] else 'PASS')})
    evidence['cases']+=cases
    item={'name':name,'command':cmd,'status':'PASS' if code==0 else 'FAIL','exitCode':code,'seconds':round(time.monotonic()-start,2),'passed':sum(c['status']=='PASS' for c in cases),'failed':sum(c['status']=='FAIL' for c in cases)}
    if code:item['failureTail']=text[-7000:]
    evidence['suites'].append(item); print(json.dumps({k:v for k,v in item.items() if k!='failureTail'}),flush=True)
    (out/'results.json').write_text(json.dumps(evidence,indent=2));return code==0
run('prisma-generate','pnpm db:generate')
run('frontend-regression','node --test tests/*.test.cjs apps/web/lib/product-sharing.test.mjs')
run('api-regression','pnpm --filter @hidi/api test:customer-experience')
run('image-regression','node --test deploy/image-optimization/*.test.mjs deploy/launch-image-repair/recovery.test.mjs')
run('large-photo-stress','node deploy/image-optimization/large-photo-check.mjs reports/image-complete/large-photo.json')
run('deployment-guards','python3 tests/shopping-ux-deploy.test.py')
run('api-build','pnpm --filter @hidi/api build')
web=run('web-build','pnpm --filter @hidi/web build',900)
run('web-lint','pnpm --filter @hidi/web lint')
for name,file in [('admin-browser','admin-workspace'),('homepage-browser','homepage-background'),('editorial-browser','editorial-storefront'),('polish-browser','editorial-polish')]:run(name,'node tests/'+file+'.browser.mjs',300,web)
evidence['summary']={'passedCases':sum(c['status']=='PASS' for c in evidence['cases']),'failedCases':sum(c['status']=='FAIL' for c in evidence['cases']),'suiteCounts':{s:sum(x['status']==s for x in evidence['suites']) for s in ['PASS','FAIL','BLOCKED']}}
evidence['releaseReady']=all(x['status']=='PASS' for x in evidence['suites']) and not evidence['unexecuted']
(out/'results.json').write_text(json.dumps(evidence,indent=2))
with (out/'cases.csv').open('w',newline='') as f:
    writer=csv.DictWriter(f,fieldnames=['suite','case','status']);writer.writeheader();writer.writerows(evidence['cases'])
lines=['# HIDI complete image candidate test results','',f'Tested commit: `{sha}`',f'Run: {evidence["runId"]}','Production changes: NONE','', '| Suite | Result | Passed cases | Failed cases |','|---|---|---:|---:|']
for x in evidence['suites']:lines.append(f'| {x["name"]} | {x["status"]} | {x.get("passed",0)} | {x.get("failed",0)} |')
lines+=['','## Not executed']+['- '+s for s in evidence['unexecuted']]+['','## Failed cases']+['- '+c['suite']+': '+c['case'] for c in evidence['cases'] if c['status']=='FAIL']
(out/'SUMMARY.md').write_text('\n'.join(lines)+'\n')
