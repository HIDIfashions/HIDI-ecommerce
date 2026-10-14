from pathlib import Path
import subprocess,os,json,time,signal,re
ROOT=Path(__file__).resolve().parents[2];OUT=Path('evidence/photo-live').resolve();OUT.mkdir(parents=True,exist_ok=True)
os.environ['NODE_ENV']='production'
os.environ['HIDI_BROWSER_ENGINES']='chromium,firefox,webkit'
report={'passed':False,'photoSourceSha':subprocess.check_output(['git','-C',str(ROOT),'rev-parse','HEAD'],text=True).strip(),'productionTrafficChanged':False,'suites':[]}
commands=[
 ('retained-api-accounting',['node','--test',str(ROOT/'deploy/photo-live/api.test.mjs')],Path.cwd(),120),
 ('photo-stream-and-optimizer',['bash','-o','pipefail','-c','node --experimental-strip-types --test deploy/image-optimization/*.test.mjs deploy/launch-image-repair/recovery.test.mjs'],ROOT,300),
 ('actual-bundle-and-retained-editor',['python',str(ROOT/'deploy/photo-live/retained-test.py')],Path.cwd(),420),
 ('retained-checkout-and-purchase',['node',str(ROOT/'deploy/checkout-offers/candidate.mjs')],Path.cwd(),480),
]
for name,cmd,cwd,limit in commands:
 start=time.monotonic();proc=subprocess.Popen(cmd,cwd=cwd,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True,start_new_session=True)
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
