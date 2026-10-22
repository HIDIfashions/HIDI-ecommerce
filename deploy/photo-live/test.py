from pathlib import Path
import subprocess,os,json,time,signal
ROOT=Path(__file__).resolve().parents[2];OUT=Path('evidence/photo-live').resolve();OUT.mkdir(parents=True,exist_ok=True)
os.environ['NODE_ENV']='production'
os.environ['HIDI_BROWSER_ENGINES']='chromium,firefox,webkit'
report={'passed':False,'photoSourceSha':subprocess.check_output(['git','-C',str(ROOT),'rev-parse','HEAD'],text=True).strip(),'productionTrafficChanged':False,'suites':[]}

# The release intentionally keeps the live API image byte-identical. Do not
# execute test-only modules from its file-traced production node_modules tree:
# those optional/dev dependencies are not required by the running API. Instead,
# prove exact API image retention and the reviewed live upload-ticket contract.
api_patch=json.loads((OUT/'api-patch.json').read_text())
api_preservation=json.loads((OUT/'api-preservation.json').read_text())
web_preservation=json.loads((OUT/'web-preservation.json').read_text())
assert api_patch.get('passed') is True and api_patch.get('apiUnchanged') is True and api_patch.get('allowedFiles')==[]
assert api_patch.get('legacyTicketIntegerCapacityBytes')==2147483647
assert api_patch.get('ticketEligibilityOnly') is True
assert api_patch.get('ticketByteAccountingDecoupled') is True
assert api_preservation.get('passed') is True and api_preservation.get('retainedUnchanged') is True and api_preservation.get('changedFiles')==[]
report['suites'].append({'name':'retained-api-byte-identity','passed':True,'exitCode':0,'seconds':0.0})
protected=('checkout','cart','payment','order','offer','account','purchase')
changed=web_preservation.get('changedFiles',[])
assert web_preservation.get('passed') is True and web_preservation.get('runtimeConfigurationPreserved') is True
assert not [name for name in changed if any(part in name.lower() for part in protected)], 'Photo release changed retained commerce/account files'
report['suites'].append({'name':'retained-commerce-byte-identity','passed':True,'exitCode':0,'seconds':0.0,'changedPhotoFiles':len(changed)})

source_api=str(ROOT)
commands=[
 ('photo-stream-and-optimizer',['bash','-o','pipefail','-c','node --experimental-strip-types --test deploy/image-optimization/*.test.mjs deploy/image-derivatives/*.test.mjs deploy/launch-image-repair/recovery.test.mjs tests/admin-product-delete-handler.test.mjs'],ROOT,420,{}),
 ('actual-bundle-and-retained-editor',['python',str(ROOT/'deploy/photo-live/retained-test.py')],Path.cwd(),420,{}),
 # These next two use the reviewed source only as a fixture engine for tests.
 # The production API under release remains the exact retained image above.
 ('fixture-api-build',['pnpm','--filter','@hidi/api','build'],ROOT,180,{}),
 ('source-api-photo-contract',['node','--test',str(ROOT/'deploy/photo-live/api.test.mjs')],Path.cwd(),120,{'HIDI_CANDIDATE_API':source_api}),
]
for name,cmd,cwd,limit,extra_env in commands:
 start=time.monotonic();env={**os.environ,**extra_env}
 proc=subprocess.Popen(cmd,cwd=cwd,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True,start_new_session=True,env=env)
 try:text,_=proc.communicate(timeout=limit);code=proc.returncode
 except subprocess.TimeoutExpired:
  os.killpg(proc.pid,signal.SIGKILL);text,_=proc.communicate();code=124
 (OUT/(name+'.log')).write_text(text)
 item={'name':name,'passed':code==0,'exitCode':code,'seconds':round(time.monotonic()-start,2)}
 if code:item['errorTail']=text[-6000:]
 report['suites'].append(item);print(json.dumps(item),flush=True)
 (OUT/'tests.json').write_text(json.dumps(report,indent=2))
report['passed']=all(x['passed'] for x in report['suites']);(OUT/'tests.json').write_text(json.dumps(report,indent=2))
assert report['passed'],'One or more composed-package checks failed; no production deployment allowed'
