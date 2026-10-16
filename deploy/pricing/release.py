"""Two-image additive offers release with tested digests and ownership-aware recovery."""
import argparse,hashlib,importlib.util,json,os,subprocess,types
from pathlib import Path
HERE=Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location('offers_guard',HERE.parent/'range-five/release.py');guard=importlib.util.module_from_spec(spec);spec.loader.exec_module(guard)
guard.PRIVATE=Path(os.environ.get('RUNNER_TEMP','/tmp'))/'hidi-pricing-private';guard.EVIDENCE=Path('evidence/pricing');guard.setup()
photo,cloud,images=guard.photo,guard.cloud,guard.images
cloud.BASE='https://hidiindia.com'
spec=importlib.util.spec_from_file_location('offers_patch',HERE/'patch-runtime.py');patch=importlib.util.module_from_spec(spec);spec.loader.exec_module(patch)
# Reuse the identical ownership-aware ARM guard for API by exchanging app names.
api_guard=types.ModuleType('offers_api_guard');api_guard.__file__=str(HERE.parent/'range-five/release.py')
source=Path(api_guard.__file__).read_text().replace('hidi-web','__OFFERS_APP__').replace('hidi-api','hidi-web').replace('__OFFERS_APP__','hidi-api')
exec(compile(source,api_guard.__file__,'exec'),api_guard.__dict__)
api_guard.PRIVATE=guard.PRIVATE;api_guard.EVIDENCE=guard.EVIDENCE;api_guard.setup()
# Both guards must share the original capture and evidence, but retain separate modules.
api_guard.photo.PRIVATE=guard.PRIVATE
P,E=guard.PRIVATE,guard.EVIDENCE
save,read=guard.save,guard.read
def tag(app,backup=False):return images.REGISTRY+'/hidi-'+app+(':backup-pricing-' if backup else ':pricing-')+guard.run_key()
def registry_digest(app,backup=False):return subprocess.check_output(['az','acr','repository','show','--name','acrhidiprod0927','--image',tag(app,backup).split('/',1)[1],'--query','digest','-o','tsv','--only-show-errors'],text=True).strip()
def capture():
 photo.capture();before=photo.states();guard.write_private('public-before.json',guard.public_snapshot());guard.write_private('catalogue-before.json',json.loads(cloud.get('/api/store/products')))
 for app in ['api','web']:
  original=before['hidi-'+app]['image'];guard.immutable(original,app)
  authfile=Path(os.environ.get('DOCKER_CONFIG',str(Path.home()/'.docker')))/'config.json'
  subprocess.run(['skopeo','copy','--all','--preserve-digests','--authfile',str(authfile),'docker://'+original,'docker://'+tag(app,True)],check=True)
  digest=registry_digest(app,True);assert digest==original.split('@')[1]
  save(app+'-backup.json',{'verified':True,'image':original,'digest':digest})
 photo.unchanged(before)
def backups():
 for app in ['api','web']:
  report=read(app+'-backup.json');assert report['verified'] and report['image']==photo.states()['hidi-'+app]['image'];assert registry_digest(app,True)==report['digest']
def compose():
 backups();before=photo.states();photo.unchanged(before)
 for app in ['api','web']:
  folder=P/app;folder.mkdir();base,overlay,candidate=(folder/n for n in ['base-app','overlay','candidate-app']);original=before['hidi-'+app]['image']
  images.extract(original,base);plan=patch.patch_runtime(base,overlay,app);save(app+'-patch.json',plan)
  for name in plan['allowedFiles']:
   if name.endswith(('.js','.mjs')):subprocess.run(['node','--check',str(overlay/name)],check=True)
  (folder/'Dockerfile').write_text('FROM '+original+'\nCOPY --chown=node:node overlay/ /app/\n');subprocess.run(['docker','build','--pull=false','-t',tag(app),str(folder)],check=True);images.extract(tag(app),candidate)
  configs=json.loads(images.docker('image','inspect',original,tag(app)));report=guard.preserve.verify(base,candidate,overlay,set(plan['allowedFiles']),configs);report.update({'baseImage':original,'candidateImageId':configs[1]['Id']});save(app+'-preservation.json',report)
 photo.unchanged(before)
def seal():
 photo.unchanged(photo.states());manifest={}
 for name in ['api-patch.json','web-patch.json','api-preservation.json','web-preservation.json','candidate/report.json','api-checkout.json','purchase-regression/report.json']:
  assert read(name)['passed'] is True,name;manifest[name]=hashlib.sha256((E/name).read_bytes()).hexdigest()
 report=read('candidate/report.json');assert len(report['results'])==6 and report['productionWrites']==0
 assert {(r['engine'],r['width']) for r in report['results']}=={(e,w) for e in ['chromium','firefox','webkit'] for w in [390,1440]}
 api=read('api-checkout.json');assert api['extraPercentRejected'] and api['privateDressEligibilityVerified'] and api['actualControllerPathVerified']
 save('sealed.json',{'passed':True,'manifest':manifest,'images':{app:guard.image_id(tag(app)) for app in ['api','web']},'sourceSha':os.environ['GITHUB_SHA']})

def publish():
 seal();sealed=read('sealed.json');result={}
 for app in ['api','web']:
  subprocess.run(['docker','push',tag(app)],check=True);assert guard.image_id(tag(app))==sealed['images'][app];result[app]=images.REGISTRY+'/hidi-'+app+'@'+registry_digest(app)
 save('published.json',{'passed':True,'images':result})
 with open(os.environ['GITHUB_ENV'],'a') as stream:
  for app,image in result.items():stream.write(app.upper()+'_IMAGE='+image+'\n')
def verify():
 sealed=read('sealed.json');assert sealed['sourceSha']==os.environ['GITHUB_SHA']
 for name,value in sealed['manifest'].items():assert hashlib.sha256((E/name).read_bytes()).hexdigest()==value
 return read('published.json')['images']
def recover():
 before=photo.states();published=verify();captured=guard.private_json('public-before.json');results={}
 # Restore web before API. Each guard only changes revisions owned by this run.
 for app,g in [('web',guard),('api',api_guard)]:
  marker=P/(app+'-forward.json')
  if not marker.exists():continue
  reference=dict(before);peer='hidi-api' if app=='web' else 'hidi-web';reference[peer]=cloud.snapshot(cloud.app(peer))
  results[app]=g.reconcile_failure(published[app],reference,captured,captured,'pricing'+app+guard.run_key('a'),bool(json.loads(marker.read_text()).get('mayComplete')))
  assert results[app]['passed'], 'Owned recovery failed'
 save('recovery.json',{'passed':True,'results':results})
def apply():
 before=photo.states();backups();published=verify();photo.unchanged(before);captured=guard.private_json('public-before.json');assert guard.public_snapshot()==captured;guard.install_interrupt_handler();deployed=dict(before)
 try:
  for app,g in [('api',api_guard),('web',guard)]:
   marker=app+'-forward.json';g.write_private(marker,{'attempted':False,'mayComplete':False});g.conditional_write_image(photo.originals()['hidi-'+app],published[app],'pricing'+app+guard.run_key('a'),marker)
   deployed['hidi-'+app]=cloud.snapshot(g.wait_ready(published[app],'pricing'+app+guard.run_key('a'),deployed));photo.unchanged(deployed)
  guard.routes();assert json.loads(cloud.get('/api/hidi/offers'))=={'visible':False};cloud.get('/api/hidi/offers/admin',401);cloud.get('/admin/offers',401);cloud.get('/api/store/auth/offers-identity',401)
  assert guard.public_snapshot()==captured;photo.unchanged(deployed)
  assert json.loads(cloud.get('/api/store/products'))==guard.private_json('catalogue-before.json'),'Catalogue changed; no automatic price writes were authorized'
  cloud.get('/admin/product-pricing',401);cloud.get('/pricing-assets/admin.mjs');assert b'Your private' in cloud.get('/offers-assets/checkout.js')
  request=__import__('urllib.request',fromlist=['Request']).Request(cloud.BASE+'/api/store/checkout/offers/quote',data=b'{"sessionId":"pricing-readonly-check","offer":{"kind":"PERCENT15","version":1}}',headers={'Content-Type':'application/json'},method='POST')
  try: __import__('urllib.request',fromlist=['urlopen']).urlopen(request,timeout=20);raise AssertionError('Extra percentage choice accepted')
  except __import__('urllib.error',fromlist=['HTTPError']).HTTPError as error: assert error.code==400 and b'percentage discounts are disabled' in error.read()
  save('after.json',{'passed':True,'states':deployed,'privateAudiencePreserved':True,'extraPercentDisabled':True,'cataloguePricesUnchanged':True,'databaseWrites':False,'sourceSha':os.environ['GITHUB_SHA']})
 except Exception:
  recover();raise
if __name__=='__main__':
 parser=argparse.ArgumentParser();parser.add_argument('mode',choices=['capture','compose','seal','publish','apply','recover']);args=parser.parse_args();globals()[args.mode]()
