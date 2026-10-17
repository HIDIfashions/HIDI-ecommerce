"""Back up current live images, test additive support overlays, and roll out with owned rollback."""
import argparse,hashlib,importlib.util,json,os,subprocess,types
from pathlib import Path
HERE=Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location('support_guard',HERE.parent/'range-five/release.py');guard=importlib.util.module_from_spec(spec);spec.loader.exec_module(guard)
guard.PRIVATE=Path(os.environ.get('RUNNER_TEMP','/tmp'))/'hidi-support-private';guard.EVIDENCE=Path('evidence/support-staff');guard.setup()
photo,cloud,images=guard.photo,guard.cloud,guard.images;cloud.BASE='https://hidiindia.com'
api_guard=types.ModuleType('support_api_guard');api_guard.__file__=str(HERE.parent/'range-five/release.py')
source=Path(api_guard.__file__).read_text().replace('hidi-web','__SUPPORT_APP__').replace('hidi-api','hidi-web').replace('__SUPPORT_APP__','hidi-api')
exec(compile(source,api_guard.__file__,'exec'),api_guard.__dict__)
api_guard.PRIVATE=guard.PRIVATE;api_guard.EVIDENCE=guard.EVIDENCE;api_guard.setup();api_guard.photo.PRIVATE=guard.PRIVATE
spec=importlib.util.spec_from_file_location('support_patch',HERE/'patch.py');patch=importlib.util.module_from_spec(spec);spec.loader.exec_module(patch)
P,E=guard.PRIVATE,guard.EVIDENCE;save,read=guard.save,guard.read
def tag(app,backup=False):return images.REGISTRY+'/hidi-'+app+(':backup-support-' if backup else ':support-')+guard.run_key()
def digest(app,backup=False):return subprocess.check_output(['az','acr','repository','show','--name','acrhidiprod0927','--image',tag(app,backup).split('/',1)[1],'--query','digest','-o','tsv','--only-show-errors'],text=True).strip()
def capture():
 photo.capture();before=photo.states();guard.write_private('public-before.json',guard.public_snapshot())
 for app in ['api','web']:
  original=before['hidi-'+app]['image'];guard.immutable(original,app)
  authfile=Path(os.environ.get('DOCKER_CONFIG',str(Path.home()/'.docker')))/'config.json'
  subprocess.run(['skopeo','copy','--all','--preserve-digests','--authfile',str(authfile),'docker://'+original,'docker://'+tag(app,True)],check=True)
  actual=digest(app,True);assert actual==original.split('@')[1];save(app+'-backup.json',{'passed':True,'image':original,'digest':actual})
 photo.unchanged(before)
def backups():
 for app in ['api','web']:
  value=read(app+'-backup.json');assert value['passed'] and value['image']==photo.states()['hidi-'+app]['image'] and digest(app,True)==value['digest']
def compose():
 backups();before=photo.states();photo.unchanged(before)
 for app in ['api','web']:
  folder=P/app;folder.mkdir();base,overlay,candidate=(folder/n for n in ['base-app','overlay','candidate-app']);original=before['hidi-'+app]['image']
  images.extract(original,base);plan=patch.patch_runtime(base,overlay,app);save(app+'-patch.json',plan)
  for name in plan['allowedFiles']:
   if name.endswith(('.js','.mjs')):subprocess.run(['node','--check',str(overlay/name)],check=True)
  (folder/'Dockerfile').write_text('FROM '+original+'\nCOPY --chown=node:node overlay/ /app/\n')
  subprocess.run(['docker','build','--pull=false','-t',tag(app),str(folder)],check=True);images.extract(tag(app),candidate)
  configs=json.loads(images.docker('image','inspect',original,tag(app)))
  report=guard.preserve.verify(base,candidate,overlay,set(plan['allowedFiles']),configs)
  report.update({'baseImage':original,'candidateImageId':configs[1]['Id']});save(app+'-preservation.json',report)
 photo.unchanged(before)
def seal():
 photo.unchanged(photo.states());manifest={}
 for name in ['api-patch.json','web-patch.json','api-preservation.json','web-preservation.json','candidate.json','compiled-api.json']:
  value=read(name);assert value['passed'] is True,name;manifest[name]=hashlib.sha256((E/name).read_bytes()).hexdigest()
 report=read('candidate.json');assert {(row['engine'],row['width']) for row in report['results']}=={(engine,width) for engine in ['chromium','firefox','webkit'] for width in [390,1440]}
 assert report['productionWrites']==0
 save('sealed.json',{'passed':True,'manifest':manifest,'images':{app:guard.image_id(tag(app)) for app in ['api','web']},'sourceSha':os.environ['GITHUB_SHA']})
def publish():
 seal();result={}
 for app in ['api','web']:
  subprocess.run(['docker','push',tag(app)],check=True);assert guard.image_id(tag(app))==read('sealed.json')['images'][app];result[app]=images.REGISTRY+'/hidi-'+app+'@'+digest(app)
 save('published.json',{'passed':True,'images':result})
 with open(os.environ['GITHUB_ENV'],'a') as stream:
  for app,image in result.items():stream.write(app.upper()+'_IMAGE='+image+'\n')
def verified():
 sealed=read('sealed.json');assert sealed['sourceSha']==os.environ['GITHUB_SHA']
 for name,value in sealed['manifest'].items():assert hashlib.sha256((E/name).read_bytes()).hexdigest()==value
 return read('published.json')['images']
def recover():
 before=photo.states();published=verified();captured=guard.private_json('public-before.json');results={}
 for app,g in [('web',guard),('api',api_guard)]:
  marker=P/(app+'-forward.json')
  if not marker.exists():continue
  reference=dict(before);peer='hidi-api' if app=='web' else 'hidi-web';reference[peer]=cloud.snapshot(cloud.app(peer))
  results[app]=g.reconcile_failure(published[app],reference,captured,captured,'support'+app+guard.run_key('a'),bool(json.loads(marker.read_text()).get('mayComplete')))
  assert results[app]['passed'],'Owned recovery failed'
 save('recovery.json',{'passed':True,'results':results})
def apply():
 before=photo.states();backups();published=verified();photo.unchanged(before);captured=guard.private_json('public-before.json');assert guard.public_snapshot()==captured;guard.install_interrupt_handler();deployed=dict(before)
 try:
  subprocess.run(['python3','deploy/support-staff/live.py','owner'],check=True)
  for app,g in [('api',api_guard),('web',guard)]:
   marker=app+'-forward.json';g.write_private(marker,{'attempted':False,'mayComplete':False})
   g.conditional_write_image(photo.originals()['hidi-'+app],published[app],'support'+app+guard.run_key('a'),marker)
   deployed['hidi-'+app]=cloud.snapshot(g.wait_ready(published[app],'support'+app+guard.run_key('a'),deployed));photo.unchanged(deployed)
  subprocess.run(['python3','deploy/support-staff/live.py','verify'],check=True)
  for path in ['/health','/api/store/health/ready','/','/collections/all','/cart','/checkout','/admin/sign-in','/admin/orders']:cloud.get(path)
  for path in ['/admin/support','/admin/staff','/api/admin/support','/api/admin/orders/release-probe/support','/api/store/admin/support']:cloud.get(path,401)
  assert b'Create admin user' in cloud.get('/support-assets/admin.mjs') or b'create-staff' in cloud.get('/support-assets/admin.mjs')
  assert guard.public_snapshot()==captured;photo.unchanged(deployed)
  save('after.json',{'passed':True,'states':deployed,'settingsPreserved':True,'publicContentPreserved':True,'primaryOwnerVerified':read('verify.json')['primaryOwnerRole']=='OWNER','sourceSha':os.environ['GITHUB_SHA']})
 except BaseException:
  recover();raise
if __name__=='__main__':
 parser=argparse.ArgumentParser();parser.add_argument('mode',choices=['capture','compose','seal','publish','apply','recover']);globals()[parser.parse_args().mode]()
