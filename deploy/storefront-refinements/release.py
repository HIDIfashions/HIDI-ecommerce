"""Guarded image-only release for approved storefront refinements; no migrations or settings changes."""
import argparse,hashlib,importlib.util,json,os,pathlib,shutil,subprocess,time
ROOT=pathlib.Path(__file__).resolve().parent

def module(name,path):
 spec=importlib.util.spec_from_file_location(name,path);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);return m
helpers=module('refinements_helpers',ROOT.parent/'compose-msg91-images.py')
cloud=module('refinements_cloud',ROOT.parent/'privacy-policy/rollout.py');cloud.BASE='https://hidiindia.com';cloud.API_VERSION='2025-07-01'
patch=module('refinements_patch',ROOT/'patch.py')
WORK=pathlib.Path(os.environ.get('RUNNER_TEMP','/tmp'))/'hidi-refinements-private'
OUT=pathlib.Path('evidence/storefront-refinements')
API_FILES={f'apps/api/dist/{name}{ext}' for name in ['checkout/checkout.controller','checkout/shipping-policy','checkout/offers-engine','delhivery/delhivery.service'] for ext in ['.js','.js.map']}
def setup():
 WORK.mkdir(parents=True,exist_ok=True);WORK.chmod(0o700);OUT.mkdir(parents=True,exist_ok=True)
def save(name,data): (OUT/name).write_text(json.dumps(data,indent=2))
def public():
 paths=['/api/hidi/hero-config','/api/hidi/landing-media-config','/api/hidi/privacy-policy']
 return {path:hashlib.sha256(cloud.get(path)).hexdigest() for path in paths}
def capture():
 setup();expected=json.loads((ROOT/'approved-base.json').read_text());states={}
 for name in ['hidi-api','hidi-web']:
  data=cloud.app(name);state=cloud.snapshot(data);cloud.ready(state);helpers.validate_image(state['image'],name.removeprefix('hidi-'))
  assert state['image']==expected[name]['image'] and state['settingsHash']==expected[name]['settingsHash'],'Production changed since the reviewed backup; refusing to replace '+name
  target=WORK/(name+'.json');target.write_text(json.dumps(data));target.chmod(0o600);states[name]=state
 save('before.json',states);save('published-before.json',public())
 with open(os.environ['GITHUB_ENV'],'a') as env:
  for name,state in states.items():env.write('EXPECTED_'+name.removeprefix('hidi-').upper()+'='+state['image']+'\n')
 print('Fresh ready images/settings match the production backup; published content captured')
def compose(app,tag):
 setup();name='hidi-'+app;base=cloud.snapshot(json.loads((WORK/(name+'.json')).read_text()))['image']
 folder=WORK/app;folder.mkdir();old=folder/'base-app';overlay=folder/'overlay';candidate=folder/'candidate-app';helpers.extract(base,old)
 if app=='api':
  for path in API_FILES:
   dest=overlay/path;dest.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(path,dest)
  retained='apps/api/dist/checkout/offers-engine.mjs'
  destination=overlay/retained;destination.parent.mkdir(parents=True,exist_ok=True)
  destination.write_text(patch.patch_retained_offer_shipping((old/retained).read_text()))
  allowed=API_FILES|{retained}
 else:
  helpers.copy_web_overlay(pathlib.Path('apps/web/.next/standalone'),pathlib.Path('apps/web/.next/static'),overlay)
  cssname,css,_=patch.assets();(overlay/'dist').mkdir()
  (overlay/'dist'/cssname).write_bytes(css)
  (overlay/'dist/index.html').write_text(patch.patch_index((old/'dist/index.html').read_text()))
  (overlay/'dist/config.js').write_text(patch.patch_config((old/'dist/config.js').read_text()))
  (overlay/'server.mjs').write_text(patch.patch_runtime((old/'server.mjs').read_text()))
  allowed={'apps/web/server.js','server.mjs','dist/index.html','dist/config.js','dist/'+cssname}
 (folder/'Dockerfile').write_text('FROM '+base+'\nCOPY --chown=node:node overlay/ /app/\n')
 subprocess.run(['docker','build','--pull=false','-t',tag,str(folder)],check=True);helpers.extract(tag,candidate)
 before,after=helpers.fingerprints(old),helpers.fingerprints(candidate);delta={p for p in before.keys()|after.keys() if before.get(p)!=after.get(p)}
 assert delta,'No approved changes in candidate'
 assert all(p in allowed or app=='web' and p.startswith('apps/web/.next/') for p in delta),'Unreviewed candidate files changed'
 assert all(after.get(p)==value for p,value in before.items() if p not in delta),'Protected files changed'
 configs=json.loads(helpers.docker('image','inspect',base,tag));assert configs[0]['Config']==configs[1]['Config'],'Image startup configuration changed';layers=configs[0]['RootFS']['Layers'];assert configs[1]['RootFS']['Layers'][:len(layers)]==layers
 save(app+'-preservation.json',{'passed':True,'changedFiles':sorted(delta),'protectedFilesIdentical':len(before)-len(delta&before.keys()),'baseImage':base,'settingsPreserved':True,'baseLayersPreserved':True})
 print(app+': exact additive overlay and retained runtime/asset preservation verified')
def wait(name,image,suffix):
 for _ in range(60):
  data=cloud.app(name);state=cloud.snapshot(data)
  if state['image']==image and state['latest']==state['ready']==name+'--'+suffix:return data
  time.sleep(10)
 raise RuntimeError('Revision did not become ready: '+name)
def apply(api,web):
 setup()
 receipt=json.loads((OUT/'candidate-verified.json').read_text())
 report=json.loads((OUT/'candidate/report.json').read_text())['reports']
 assert receipt['passed'] and receipt['compiledApiFixturesPassed'] and receipt['retainedUploadChecksPassed'] and receipt['adminRoutesPassed'],'Candidate tests did not pass'
 assert receipt['runId']==os.environ['GITHUB_RUN_ID'] and receipt['commit']==os.environ['GITHUB_SHA'],'Candidate receipt is from different inputs'
 assert len(report)==12 and all(row['status']=='PASS' for row in report) and {(row['engine'],row['width']) for row in report}=={(engine,width) for engine in ['chromium','firefox','webkit'] for width in [320,390,844,1440]},'Desktop/mobile candidate matrix is incomplete'
 for app,image in [('api',api),('web',web)]:
  assert helpers.docker('image','inspect','--format','{{.Id}}',image).strip()==receipt[app+'Id'],'Image differs from the tested candidate'
 images={'hidi-api':api,'hidi-web':web};old={name:json.loads((WORK/(name+'.json')).read_text()) for name in images};before={name:cloud.snapshot(data) for name,data in old.items()};protected=json.loads((OUT/'published-before.json').read_text());owned={};run=os.environ['GITHUB_RUN_ID']
 assert public()==protected,'Published content changed since candidate capture'
 for name,image in images.items():
  helpers.validate_image(image,name.removeprefix('hidi-'));assert cloud.snapshot(cloud.app(name))==before[name],'Concurrent deployment changed '+name
 try:
  # API first: an old frontend may display the former quote briefly, but the server
  # rejects stale totals. The new UI must never show zero while the old API charges.
  for name,image in images.items():
   assert cloud.snapshot(cloud.app(name))==before[name],'Concurrent deployment changed '+name
   suffix='refinements'+name.removeprefix('hidi-')+run;owned[name]=image;cloud.write_image(old[name],image,suffix)
   state=cloud.snapshot(wait(name,image,suffix));assert state['settingsHash']==before[name]['settingsHash'],'App settings changed'
  for path in ['/health','/healthz','/api/store/health/ready','/','/about','/collections/all','/cart','/checkout','/account','/shipping','/returns','/admin','/admin/products/price-tags','/admin/landing-media','/admin/packing-scanner','/admin/privacy-policy']:cloud.get(path)
  assert public()==protected,'Published hero, media or privacy policy changed'
  subprocess.run(['node','deploy/storefront-refinements/probes.mjs','https://hidiindia.com','evidence/storefront-refinements/live'],check=True,timeout=900)
  after={name:cloud.snapshot(cloud.app(name)) for name in images}
  for name in images:assert after[name]['image']==images[name] and after[name]['settingsHash']==before[name]['settingsHash'];cloud.ready(after[name])
  save('after.json',{'states':after,'shippingPaise':0,'settingsPreserved':True,'publishedContentPreserved':True,'primaryDomain':'https://hidiindia.com'})
  print('PASS: all five approved changes live; desktop/mobile checks passed; settings and published content preserved')
 except Exception:
  restored=[];unrestored=[]
  for name,image in reversed(list(owned.items())):
   try:
    current=cloud.app(name);state=cloud.snapshot(current)
    if state['image']==image and state['settingsHash']==before[name]['settingsHash']:
     suffix='refinementrollback'+name.removeprefix('hidi-')+run;cloud.write_image(current,before[name]['image'],suffix);wait(name,before[name]['image'],suffix);restored.append(name)
    elif state['image']!=before[name]['image']:unrestored.append({'app':name,'reason':'Concurrent image or settings change; no overwrite attempted'})
   except Exception as rollback_error:unrestored.append({'app':name,'reason':type(rollback_error).__name__})
  save('rollback.json',{'restoredApps':restored,'unrestoredApps':unrestored});raise
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('action',choices=['capture','compose','apply']);p.add_argument('--app');p.add_argument('--image');p.add_argument('--api');p.add_argument('--web');a=p.parse_args()
 if a.action=='capture':capture()
 elif a.action=='compose':compose(a.app,a.image)
 else:apply(a.api,a.web)
