"""Build both applications and verify the real upload UI with isolated transports."""
from pathlib import Path
import json,os,subprocess,time,signal,re,html,csv
out=Path('reports/upload-integration');out.mkdir(parents=True,exist_ok=True)
data={'testedCommit':subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip(),'runId':os.environ.get('GITHUB_RUN_ID','local'),'productionChanged':False,'storage':'Isolated filesystem, not Azure','suites':[],'cases':[]}
auth=json.loads(Path('deploy/public-auth.json').read_text())
for key in ['SUPABASE_URL','SUPABASE_PUBLISHABLE_KEY','CUSTOMER_AUTH_PROVIDER','CUSTOMER_OTP_CHANNEL','FIREBASE_API_KEY','FIREBASE_AUTH_DOMAIN','FIREBASE_PROJECT_ID','FIREBASE_APP_ID','FIREBASE_MESSAGING_SENDER_ID','FIREBASE_STORAGE_BUCKET']:
 os.environ['NEXT_PUBLIC_'+key]=str(auth.get(key,auth.get('NEXT_PUBLIC_'+key,'')))
os.environ['NEXT_PUBLIC_API_URL']='/api/store'
def run(name,cmd,timeout=300):
 started=time.monotonic();p=subprocess.Popen(['bash','-o','pipefail','-c',cmd],stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True,start_new_session=True)
 try:text,_=p.communicate(timeout=timeout);code=p.returncode
 except subprocess.TimeoutExpired:
  os.killpg(p.pid,signal.SIGKILL);text,_=p.communicate();code=124
 (out/(name+'.log')).write_text(text)
 for line in text.splitlines():
  m=re.match(r'^(not )?ok\s+\d+\s+-\s+(.*)',line)
  if m:data['cases'].append({'suite':name,'case':m[2],'status':'FAIL' if m[1] else 'PASS'})
 data['suites'].append({'name':name,'status':'PASS' if code==0 else 'FAIL','exitCode':code,'seconds':round(time.monotonic()-started,2),'failureTail':text[-8000:] if code else ''})
 (out/'results.json').write_text(json.dumps(data,indent=2));print(name,code,flush=True)
 return code==0
run('current-route-and-client','node --experimental-strip-types --test tests/image-sku-runtime-keys.test.mjs tests/photo-digest.test.mjs tests/photo-upload-client.test.cjs tests/seo-images.test.cjs')
run('prisma-generate','pnpm db:generate')
run('api-build','pnpm --filter @hidi/api build')
run('api-regression','pnpm --filter @hidi/api test:customer-experience')
built=run('web-build','pnpm --filter @hidi/web build',600)
run('browser-photo-digest','node tests/photo-digest.browser.mjs')
if built:run('web-upload-and-rendering','node --experimental-strip-types tests/photo-web-upload.browser.mjs',420)
else:data['suites'].append({'name':'web-upload-and-rendering','status':'BLOCKED'})
for folder in ['photo-digest','photo-web-upload']:
 p=Path('test-results')/folder/'results.json'
 if p.exists():
  body=json.loads(p.read_text())
  for case in body.get('results',[]):data['cases'].append({'suite':folder,**case})
  if folder=='photo-web-upload':data['imageMeasurements']=body.get('snapshots',[])
data['unexecuted']=['Real Azure storage and deployed ingress verification','SQL migration execution and production deployment','Real garment colour and embroidery approval','The separately prepared compiled-route HTTP probe was not executed in this suite']
data['counts']={status:sum(c['status']==status for c in data['cases']) for status in ['PASS','FAIL','SKIP']}
(out/'results.json').write_text(json.dumps(data,indent=2))
with (out/'cases.csv').open('w',newline='') as f:
 writer=csv.DictWriter(f,fieldnames=['suite','engine','case','status','error'],extrasaction='ignore');writer.writeheader();writer.writerows(data['cases'])
lines=['# Latest browser upload and rendering verification','', 'Tested commit: '+data['testedCommit'],'Run: '+data['runId'],'Production changes: NONE','Storage: isolated filesystem; actual upload handler and built UI','', '| Check | Result |','|---|---|']
lines += ['| '+s['name']+' | '+s['status']+' |' for s in data['suites']]
lines += ['','## Browser cases']+['- '+c.get('engine','')+' / '+c['case']+': '+c['status'] for c in data['cases'] if c['suite'] in ['photo-digest','photo-web-upload']]
lines += ['','## Not executed']+['- '+s for s in data['unexecuted']]
(out/'SUMMARY.md').write_text('\n'.join(lines)+'\n')
escape=lambda value:html.escape(str(value))
rows=''.join('<tr><td>'+escape(c['suite'])+'</td><td>'+escape(c.get('engine',''))+'</td><td>'+escape(c['case'])+'</td><td>'+escape(c['status'])+'</td></tr>' for c in data['cases'])
page='''<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>HIDI upload verification</title><style>body{font:16px system-ui;margin:32px;line-height:1.5}main{max-width:1200px;margin:auto}table{border-collapse:collapse;width:100%}th,td{text-align:left;border-bottom:1px solid #ddd;padding:10px}input{font:inherit;padding:10px;width:90%;margin:20px 0}.notice{padding:16px;background:#f4f1e9}code{overflow-wrap:anywhere}</style><main><h1>HIDI upload & rendering verification</h1>'''
page+='<p>Commit <code>'+escape(data['testedCommit'])+'</code> · Run '+escape(data['runId'])+'</p><p class="notice">Isolated storage and backend fixtures. No production deployment, Azure upload or database migration. Failed and unexecuted checks are not counted as passed.</p>'
page+='<p>'+escape(data['counts'])+'</p><input id="q" placeholder="Search a test case or result" aria-label="Search test results"><table><thead><tr><th>Suite</th><th>Browser</th><th>Case</th><th>Result</th></tr></thead><tbody>'+rows+'</tbody></table><h2>Not executed</h2><p>'+'<br>'.join(escape(s) for s in data['unexecuted'])+'</p></main><script>document.getElementById("q").addEventListener("input",e=>{const q=e.target.value.toLowerCase();document.querySelectorAll("tbody tr").forEach(r=>r.hidden=!r.textContent.toLowerCase().includes(q));});</script></html>'
(out/'REPORT.html').write_text(page)
