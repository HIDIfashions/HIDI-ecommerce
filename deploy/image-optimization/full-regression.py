"""Run all repository unit fixtures and independent build/browser gates. No cloud writes."""
import subprocess, pathlib, json, os, re, time, csv, signal, sys
root=pathlib.Path.cwd(); out=root/'reports/image-complete';out.mkdir(parents=True,exist_ok=True)
sha=subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip()
evidence={'testedCommit':sha,'runId':os.environ.get('GITHUB_RUN_ID','local'),'productionChanged':False,'databaseMigrationApplied':False,'suites':[],'cases':[], 'unexecuted':[
'Authenticated Azure service upload, actual ingress limits, SQL migration and measured Azure memory/disk use',
'Real HIDI garment colour, embroidery and zoom approval',
'Production deployment and live website speed measurement',
'Retained-container-only browser fixtures (Product Upload full runtime, navigation, OTP, privacy integration) require matching container snapshots, not a fresh Next build']}
inventory={'testFiles':[], 'versions':{}}
for folder in ['tests','deploy']:
 inventory['testFiles'] += [str(p.relative_to(root)) for p in (root/folder).rglob('*') if p.is_file() and ('.test.' in p.name or '.browser.' in p.name)]
for cmd in ['node --version','pnpm --version','python --version']:
 inventory['versions'][cmd]=subprocess.check_output(cmd,shell=True,text=True).strip()
(out/'inventory.json').write_text(json.dumps(inventory,indent=2))
auth=json.loads((root/'deploy/public-auth.json').read_text())
for key in ['SUPABASE_URL','SUPABASE_PUBLISHABLE_KEY','CUSTOMER_AUTH_PROVIDER','CUSTOMER_OTP_CHANNEL','FIREBASE_API_KEY','FIREBASE_AUTH_DOMAIN','FIREBASE_PROJECT_ID','FIREBASE_APP_ID','FIREBASE_MESSAGING_SENDER_ID','FIREBASE_STORAGE_BUCKET']:
 os.environ['NEXT_PUBLIC_'+key]=str(auth.get(key,auth.get('NEXT_PUBLIC_'+key,'')))
# Match the production same-origin browser API configuration during the build.
os.environ['NEXT_PUBLIC_API_URL']='/api/store'
os.environ['HIDI_BROWSER_ENGINES']='chromium,firefox,webkit'

def save(): (out/'results.json').write_text(json.dumps(evidence,indent=2))
def run(name,cmd,timeout=600,requires=None):
 if requires is not None and not requires:
  evidence['suites'].append({'name':name,'status':'BLOCKED','reason':'Required complete application build failed','command':cmd});save();return False
 start=time.monotonic();p=subprocess.Popen(['bash','-o','pipefail','-c',cmd],stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True,start_new_session=True)
 try: text,_=p.communicate(timeout=timeout);code=p.returncode
 except subprocess.TimeoutExpired:
  os.killpg(p.pid,signal.SIGKILL);text,_=p.communicate();code=124
 (out/(name+'.log')).write_text(text)
 cases=[]
 for line in text.splitlines():
  m=re.match(r'^(not )?ok\s+(\d+)\s+-\s+(.*)',line)
  if m:cases.append({'suite':name,'case':m[3],'status':'SKIP' if '# SKIP' in m[3] else ('FAIL' if m[1] else 'PASS'),'details':''})
  m=re.match(r'^(test_\w+)\s+\((.*?)\)\s*\.\.\.\s*(ok|FAIL|ERROR|skipped.*)',line)
  if m:cases.append({'suite':name,'case':m[1]+' ('+m[2]+')','status':'PASS' if m[3]=='ok' else 'SKIP' if m[3].startswith('skipped') else 'FAIL','details':''})
  if name.startswith('admin-browser-') and line.startswith('PASS '):cases.append({'suite':name,'case':line[5:],'status':'PASS','details':''})
 evidence['cases']+=cases
 item={'name':name,'command':cmd,'status':'PASS' if code==0 else 'FAIL','exitCode':code,'seconds':round(time.monotonic()-start,2),'passed':sum(c['status']=='PASS' for c in cases),'failed':sum(c['status']=='FAIL' for c in cases)}
 if code:item['failureTail']=text[-7000:]
 evidence['suites'].append(item);print(json.dumps({k:v for k,v in item.items() if k!='failureTail'}),flush=True);save();return code==0
run('prisma-generate','pnpm db:generate')
run('frontend-regression','node --experimental-strip-types --test --test-concurrency=2 --test-timeout=60000 tests/*.test.cjs tests/*.test.mjs apps/web/lib/product-sharing.test.mjs')
run('api-regression','pnpm --filter @hidi/api test:customer-experience')
run('image-and-overlay-regression',"find deploy -name '*.test.mjs' -print0 | xargs -0 node --experimental-strip-types --test --test-concurrency=2 --test-timeout=60000")
run('legacy-buffer-boundary','node deploy/image-optimization/large-photo-check.mjs reports/image-complete/legacy-buffer-boundary.json')
run('genuine-large-photo','node deploy/image-optimization/genuine-large-photo.mjs reports/image-complete/genuine-large-photo.json')
for file in sorted((root/'tests').glob('*.test.py')):run('python-'+file.name.replace('.test.py',''),'python '+str(file.relative_to(root))+' -v',180)
run('api-build','pnpm --filter @hidi/api build')
web=run('web-build','pnpm --filter @hidi/web build',900)
run('web-lint','pnpm --filter @hidi/web lint')
# Standalone localhost fixtures exercise actual served admin modules; none uses live credentials.
for name,file in [('browser-photo-digest','photo-digest'),('browser-admin-quick-tools','admin-quick-tools'),('browser-skn-photos','product-skn-photos'),('browser-button-states','button-states'),('browser-admin-product-delete','admin-product-delete')]:
 run(name,'node --experimental-strip-types tests/'+file+'.browser.mjs',300)
for engine in ['chromium','firefox','webkit']:run('admin-browser-'+engine,'HIDI_BROWSER_ENGINE='+engine+' node tests/admin-workspace.browser.mjs',240,web)
run('homepage-browser','node tests/homepage-background.browser.mjs',240,web)
run('editorial-browser','node tests/editorial-storefront.browser.mjs',900,web)
run('polish-browser','node tests/editorial-polish.browser.mjs',300,web)
run('navigation-browser','node tests/admin-navigation.browser.mjs',300)
run('otp-browser','node tests/auth-otp-resend.browser.mjs',300,web)
run('web-upload-and-rendering','node --experimental-strip-types tests/photo-web-upload.browser.mjs',420,web)
# Preserve the case-level JSON emitted by browser suites, including failures.
seen=set()
for p in sorted((root/'test-results').rglob('*.json')):
 if 'failure' in p.name:continue
 try:data=json.loads(p.read_text())
 except Exception:continue
 rows=data if isinstance(data,list) else data.get('results',[]) if isinstance(data,dict) else []
 if not isinstance(rows,list):continue
 for n,item in enumerate(rows):
  if not isinstance(item,dict):continue
  status=item.get('status')
  if status not in ['PASS','FAIL','SKIP']:status='PASS' if item.get('passed') is True else 'FAIL' if item.get('passed') is False else None
  if not status:continue
  name=' / '.join(str(item.get(k)) for k in ['engine','id','case','name','mode','width','height'] if item.get(k) is not None) or 'case '+str(n+1)
  suite='browser:'+str(p.parent.relative_to(root/'test-results'))
  key=(suite,name)
  if key in seen:continue
  seen.add(key);evidence['cases'].append({'suite':suite,'case':name,'status':status,'details':str(item.get('error',''))})
evidence['summary']={'caseCounts':{s:sum(c['status']==s for c in evidence['cases']) for s in ['PASS','FAIL','SKIP']},'suiteCounts':{s:sum(x['status']==s for x in evidence['suites']) for s in ['PASS','FAIL','BLOCKED']}}
evidence['releaseReady']=all(x['status']=='PASS' for x in evidence['suites']) and not evidence['unexecuted'];save()
with (out/'cases.csv').open('w',newline='') as f:
 writer=csv.DictWriter(f,fieldnames=['suite','case','status','details']);writer.writeheader();writer.writerows(evidence['cases'])
lines=['# HIDI complete application and upload tests','',f'Tested commit: `{sha}`',f'Run: {evidence["runId"]}','Production and database changes: NONE','', '| Suite | Result | Passed cases | Failed cases |','|---|---|---:|---:|']
for x in evidence['suites']:lines.append(f'| {x["name"]} | {x["status"]} | {x.get("passed",0)} | {x.get("failed",0)} |')
lines+=['','Browser per-case results are included in cases.csv; command-only gates do not invent case counts.','Legacy buffer boundary tests concern an unused buffered helper, not the live-route photo size policy.','', '## Not executed']+['- '+s for s in evidence['unexecuted']]+['','## Failed cases']+['- '+c['suite']+': '+c['case'] for c in evidence['cases'] if c['status']=='FAIL']
(out/'SUMMARY.md').write_text('\n'.join(lines)+'\n')
