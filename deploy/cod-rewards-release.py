"""Back up fresh live images, overlay only reviewed checkout files, and roll back on failure."""
import argparse,hashlib,importlib.util,json,os,pathlib,re,shutil,subprocess,time
ROOT=pathlib.Path(__file__).resolve().parent

def module(name,path):
 s=importlib.util.spec_from_file_location(name,path);m=importlib.util.module_from_spec(s);s.loader.exec_module(m);return m
helpers=module('checkout_image_helpers',ROOT/'compose-msg91-images.py')
cloud=module('checkout_cloud',ROOT/'privacy-policy/rollout.py')
cloud.API_VERSION='2025-07-01'
work=pathlib.Path(os.environ.get('RUNNER_TEMP','/tmp'))/'hidi-cod-private';work.mkdir(exist_ok=True);work.chmod(0o700)
evidence=pathlib.Path('evidence/cod-rewards');evidence.mkdir(parents=True,exist_ok=True)
API_FILES={f'apps/api/dist/{path}{ext}' for path in ['checkout/checkout.service','checkout/checkout.controller','checkout/shipping-policy','carts/carts.service','admin/admin.service','admin/admin.controller'] for ext in ['.js','.js.map']}

def save(name,value): (evidence/name).write_text(json.dumps(value,indent=2))
def wait(name,image,suffix):
 for _ in range(60):
  data=cloud.app(name);state=cloud.snapshot(data)
  if state['image']==image and state['latest']==state['ready']==name+'--'+suffix:return data
  time.sleep(10)
 raise RuntimeError('Candidate did not become ready: '+name)
def capture():
 states={}
 for name in ['hidi-api','hidi-web']:
  data=cloud.app(name);state=cloud.snapshot(data);cloud.ready(state);helpers.validate_image(state['image'],name.removeprefix('hidi-'))
  (work/(name+'.json')).write_text(json.dumps(data));(work/(name+'.json')).chmod(0o600);states[name]=state
 save('before.json',states)
 with open(os.environ['GITHUB_ENV'],'a') as stream:
  for name,state in states.items():stream.write('EXPECTED_'+name.removeprefix('hidi-').upper()+'='+state['image']+'\n')
 print('Fresh ready API and web captured; exact settings retained privately')
def compose(app,tag):
 name='hidi-'+app;base=cloud.snapshot(json.loads((work/(name+'.json')).read_text()))['image']
 folder=work/app;folder.mkdir();old=folder/'base-app';overlay=folder/'overlay';candidate=folder/'candidate-app';helpers.extract(base,old)
 if app=='api':
  for path in API_FILES:
   dest=overlay/path;dest.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(path,dest)
 else:
  helpers.copy_web_overlay(pathlib.Path('apps/web/.next/standalone'),pathlib.Path('apps/web/.next/static'),overlay)
  html=(old/'dist/index.html').read_text();assert html.lower().count('</head>')==1
  html=re.sub(r'<script\b[^>]*\bdata-hidi-app-soon\b[^>]*>\s*</script>\s*','',html,flags=re.I)
  script=(ROOT/'app-coming-soon.js').read_bytes();scriptname='app-coming-soon-'+hashlib.sha256(script).hexdigest()[:16]+'.js'
  (overlay/'dist').mkdir();(overlay/'dist'/scriptname).write_bytes(script)
  (overlay/'dist/index.html').write_text(re.sub(r'</head>',f'<script defer data-hidi-app-soon src="/{scriptname}"></script>\n</head>',html,count=1,flags=re.I))
 (folder/'Dockerfile').write_text('FROM '+base+'\nCOPY --chown=node:node overlay/ /app/\n')
 subprocess.run(['docker','build','--pull=false','-t',tag,str(folder)],check=True);helpers.extract(tag,candidate)
 a,b=helpers.fingerprints(old),helpers.fingerprints(candidate);delta={p for p in a.keys()|b.keys() if a.get(p)!=b.get(p)}
 if app=='api':
  assert delta<=API_FILES,'Unreviewed API file changed'
  if not delta:subprocess.run(['docker','tag',base,tag],check=True)
 else:
  assert delta and all(p.startswith('apps/web/.next/') or p in {'apps/web/server.js','dist/index.html','dist/'+scriptname} for p in delta),'Unreviewed web file changed'
  assert all(b.get(p)==value for p,value in a.items() if not p.startswith('apps/web/.next/') and p not in {'apps/web/server.js','dist/index.html'}),'Protected homepage, admin, media or runtime changed'
 configs=json.loads(helpers.docker('image','inspect',base,tag));assert configs[0]['Config']==configs[1]['Config'];layers=configs[0]['RootFS']['Layers'];assert configs[1]['RootFS']['Layers'][:len(layers)]==layers
 save(app+'-preservation.json',{'passed':True,'changedFiles':sorted(delta),'protectedFilesIdentical':len(a)-len(delta&a.keys()),'baseImage':base,'alreadyCurrent':not delta,'settingsPreserved':True,'baseLayersPreserved':True})
 print(app+': reviewed overlay verified; protected files and image configuration preserved')
def public():
 paths=['/api/hidi/hero-config','/api/hidi/landing-media-config','/api/hidi/privacy-policy']
 bodies={p:cloud.get(p) for p in paths};published=json.loads(bodies['/api/hidi/privacy-policy']).get('published',False)
 bodies['/privacy']=cloud.get('/privacy',200 if published else 404)
 return {p:hashlib.sha256(body).hexdigest() for p,body in bodies.items()}
def apply(api,web):
 # Publish the shipping-aware UI first; it blocks payment until the API confirms
 # a quote, so the rollout cannot introduce an undisclosed shipping fee.
 images={'hidi-web':web,'hidi-api':api};old={n:json.loads((work/(n+'.json')).read_text()) for n in images};before={n:cloud.snapshot(d) for n,d in old.items()};protected=public();owned={};run=os.environ['GITHUB_RUN_ID'];expected={}
 for name,data in old.items():
  modified=__import__('copy').deepcopy(data)
  if name=='hidi-api':
   env=modified['properties']['template']['containers'][0]['env'];names={'HIDI_COD_ENABLED','HIDI_WALLET_ENABLED','HIDI_WALLET_WORKER_ENABLED'}
   env[:]=[item for item in env if item['name'] not in names]+[{'name':key,'value':'true'} for key in sorted(names)]
  expected[name]=modified
 for n in images:
  helpers.validate_image(images[n],n.removeprefix('hidi-'));assert cloud.snapshot(cloud.app(n))==before[n],'Concurrent release changed '+n+'; refusing to overwrite it'
 try:
  for n,image in images.items():
   assert cloud.snapshot(cloud.app(n))==before[n],'Concurrent deployment changed '+n
   suffix='cod'+n.removeprefix('hidi-')+run;owned[n]=image;cloud.write_image(expected[n],image,suffix)
   state=cloud.snapshot(wait(n,image,suffix));assert state['settingsHash']==cloud.snapshot(expected[n])['settingsHash'],'App settings changed'
  for p in ['/health','/healthz','/api/store/health/ready','/collections/all','/cart','/checkout','/account','/wishlist','/shipping','/returns','/admin','/admin/products/price-tags','/admin/landing-media','/admin/packing-scanner','/admin/privacy-policy']:cloud.get(p)
  assert __import__('json').loads(cloud.get('/api/store/checkout/payment-options')).get('cod') is True
  assert public()==protected,'Published homepage/media/privacy changed'
  subprocess.run(['node','deploy/cod-rewards-probes.mjs','https://thidigk.thehidi.com','live'],check=True,timeout=540)
  after={n:cloud.snapshot(cloud.app(n)) for n in images}
  for n in after:assert after[n]['image']==images[n] and after[n]['settingsHash']==cloud.snapshot(expected[n])['settingsHash'];cloud.ready(after[n])
  save('after.json',{'states':after,'publishedContentPreserved':True,'settingsPreserved':True,'codEnabled':True,'walletEnabled':True,'walletWorkerEnabled':True,'shippingFeePaise':9900,'freeShippingThresholdPaise':149900});print('PASS: ready API/web deployed; COD and rewards enabled with all unrelated settings and published content preserved')
 except Exception:
  restored=[]
  for n,image in reversed(list(owned.items())):
   current=cloud.app(n);state=cloud.snapshot(current)
   if state['image']==image and state['settingsHash']==cloud.snapshot(expected[n])['settingsHash']:
    suffix='checkoutrollback'+n.removeprefix('hidi-')+run;cloud.write_image(old[n],before[n]['image'],suffix);wait(n,before[n]['image'],suffix);restored.append(n)
  save('rollback.json',{'restoredApps':restored});raise
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('action',choices=['capture','compose','apply']);p.add_argument('--app');p.add_argument('--image');p.add_argument('--api');p.add_argument('--web');a=p.parse_args()
 if a.action=='capture':capture()
 elif a.action=='compose':compose(a.app,a.image)
 else:apply(a.api,a.web)
