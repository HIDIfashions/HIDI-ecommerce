import json,subprocess,time,urllib.request,hashlib,importlib.util,os
from pathlib import Path

def az(*args):
 return json.loads(subprocess.check_output(['az',*args,'--only-show-errors','-o','json'],text=True))
for name in ['hidi-web','hidi-api']:
 a=az('containerapp','show','-g','rg-hidi-prod','-n',name);p=a['properties'];print('APP',json.dumps({'name':name,'image':p['template']['containers'][0]['image'],'ready':p.get('latestReadyRevisionName'),'latest':p.get('latestRevisionName'),'scale':p['template'].get('scale'),'resources':p['template']['containers'][0].get('resources'),'traffic':p['configuration']['ingress'].get('traffic')}),flush=True)
 print('REPLICAS',json.dumps(az('containerapp','replica','list','-g','rg-hidi-prod','-n',name,'--revision',p['latestReadyRevisionName'])),flush=True)
BASE='https://hidiindia.com'
for path in ['/','/collections/casual-wear','/collections/all','/api/store/products','/api/store/health/ready']:
 for n in range(2):
  start=time.monotonic()
  try:
   with urllib.request.urlopen(urllib.request.Request(BASE+path,headers={'Accept-Encoding':'gzip'}),timeout=40) as r:
    hdr=round((time.monotonic()-start)*1000);b=r.read();print('HTTP',json.dumps({'path':path,'status':r.status,'ttfb':hdr,'total':round((time.monotonic()-start)*1000),'bytes':len(b),'serverTiming':r.headers.get('server-timing'),'contentEncoding':r.headers.get('content-encoding'),'cache':r.headers.get('x-hidi-image-cache')}),flush=True)
  except Exception as e:print('HTTP_ERROR',path,type(e).__name__,str(e)[:160],flush=True)
spec=importlib.util.spec_from_file_location('images',Path('deploy/compose-msg91-images.py'));m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
a=az('containerapp','show','-g','rg-hidi-prod','-n','hidi-web');image=a['properties']['template']['containers'][0]['image'];root=Path(os.environ['RUNNER_TEMP'])/'hidi-launch-inspect-app';m.extract(image,root)
for name in ['server.mjs','product-images/images.mjs','performance/delivery.mjs']:
 p=root/name
 if not p.exists():print('MISSING',name);continue
 s=p.read_text();print('RUNTIME',name,'SHA',hashlib.sha256(p.read_bytes()).hexdigest(),'bytes',p.stat().st_size,flush=True)
 if name!='server.mjs':print('SOURCE_BEGIN',name,flush=True);print(s,flush=True);print('SOURCE_END',name,flush=True)
 else:
  for needle in ['proxy','api/store','fetch(','cache','createProductImageHandler','createServer']:
   pos=0
   for count in range(8):
    pos=s.find(needle,pos)
    if pos<0:break
    print('SERVER_SNIPPET',needle,s[max(0,pos-250):pos+600],flush=True);pos+=len(needle)
