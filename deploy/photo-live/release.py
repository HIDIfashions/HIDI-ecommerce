"""Photo-only deployment. Reuses the existing ownership-aware ARM release guard."""
import argparse,hashlib,importlib.util,json,os,subprocess,urllib.request,time,shutil
from pathlib import Path
HERE=Path(__file__).resolve().parent;ROOT=HERE.parents[1]
def load(name,path):
 s=importlib.util.spec_from_file_location(name,path);m=importlib.util.module_from_spec(s);s.loader.exec_module(m);return m
r=load('photo_live_guard',HERE.parent/'checkout-offers/release.py')
state_reader=load('photo_live_arm_state',HERE/'arm-state.py')
assert r.cloud is r.photo.cloud and r.cloud is r.guard.cloud
assert r.api_guard.cloud is r.api_guard.photo.cloud
state_readers=[state_reader.install(g.cloud) for g in [r.guard,r.api_guard]]
for g in [r.guard,r.api_guard]:
 g.PRIVATE=Path(os.environ.get('RUNNER_TEMP','/tmp'))/'hidi-photo-live-private';g.EVIDENCE=Path('evidence/photo-live');g.setup()
r.P=r.guard.PRIVATE;r.E=r.guard.EVIDENCE;r.api_guard.photo.PRIVATE=r.P
r.tag=lambda app,backup=False:r.images.REGISTRY+'/hidi-'+app+(':backup-photo-stream-' if backup else ':photo-stream-')+r.guard.run_key()
P,E=r.P,r.E;save,read=r.save,r.read
patcher=load('photo_live_patch',HERE/'patch.py')
allocator=load('photo_live_allocator',HERE/'allocator-config.py')
def source_sha():return subprocess.check_output(['git','-C',str(ROOT),'rev-parse','HEAD'],text=True).strip()
def capture():
 r.capture();save('photo-scope.json',{'sourceSha':os.environ['GITHUB_SHA'],'photoSourceSha':source_sha(),'scope':'Retained-runtime photo-only overlay','sqlSchemaChanged':False,'ticketEligibilityOnly':True,'ticketByteAccountingDecoupled':True,'legacyTicketIntegerCapacityBytes':2147483647})
 save('arm-state-readers.json',{'passed':True,'readers':state_readers,'snapshotRulesUnchanged':True,'conditionalWriteRulesUnchanged':True})
 r.guard.write_private('offers-before.json',json.loads(r.cloud.get('/api/hidi/offers')))
def compose():
 r.fresh_source();r.backups();before=r.photo.states();r.photo.unchanged(before)
 allocator.verify_app_override(r.cloud.app('hidi-web')['properties']['template']['containers'][0].get('env',[]))
 for app in ['api','web']:
  folder=P/app;folder.mkdir(exist_ok=True);base,overlay,candidate=(folder/n for n in ['base-app','overlay','candidate-app'])
  r.images.extract(before['hidi-'+app]['image'],base)
  plan=patcher.patch(base,overlay,app);save(app+'-patch.json',plan)
  for name in plan['allowedFiles']:
   if name.endswith(('.js','.mjs','.cjs')):subprocess.run(['node','--check',str(overlay/name)],check=True)
  if not plan['allowedFiles']:
   assert app=='api' and plan.get('apiUnchanged') is True,'Only the reviewed API may be retained without an overlay'
   shutil.copytree(base,candidate,dirs_exist_ok=True)
   config=json.loads(r.images.docker('image','inspect',before['hidi-'+app]['image']))[0]
   save(app+'-preservation.json',{'passed':True,'baseImage':before['hidi-'+app]['image'],'candidateImageId':config['Id'],'changedFiles':[],'retainedUnchanged':True})
   continue
  assert app=='web','Only the image-processing web runtime may receive the allocator setting'
  (folder/'Dockerfile').write_text('FROM '+before['hidi-'+app]['image']+'\nENV MALLOC_ARENA_MAX=2\nCOPY --chown=node:node overlay/ /app/\n')
  subprocess.run(['docker','build','--pull=false','-t',r.tag(app),str(folder)],check=True)
  r.images.extract(r.tag(app),candidate)
  configs=json.loads(r.images.docker('image','inspect',before['hidi-'+app]['image'],r.tag(app)))
  expected_configs,allocator_delta=allocator.preservation_configs(configs)
  report=r.guard.preserve.verify(base,candidate,overlay,set(plan['allowedFiles']),expected_configs)
  report.update({'runtimeConfigurationPreserved':configs[0]['Config']==configs[1]['Config'],'runtimeConfigurationPreservedExceptPhotoAllocator':True,'photoAllocator':allocator_delta,'runtimeConfigSha256':hashlib.sha256(json.dumps(configs[1]['Config'],sort_keys=True,separators=(',',':')).encode()).hexdigest()})
  report.update({'baseImage':before['hidi-'+app]['image'],'candidateImageId':configs[1]['Id']});save(app+'-preservation.json',report)
 r.photo.unchanged(before)
 with open(os.environ['GITHUB_ENV'],'a') as f:
  f.write('HIDI_CANDIDATE_RUNTIME='+str(P/'web/candidate-app')+'\nHIDI_CANDIDATE_API='+str(P/'api/candidate-app')+'\n')
def seal():
 r.photo.unchanged(r.photo.states());manifest={}
 for name in ['api-patch.json','web-patch.json','api-preservation.json','web-preservation.json']:
  assert read(name)['passed'] is True,name;manifest[name]=hashlib.sha256((E/name).read_bytes()).hexdigest()
 passed=read('tests.json');assert passed['passed'] and passed['photoSourceSha']==source_sha()
 browser=json.loads((ROOT/'test-results/photo-web-upload/results.json').read_text())
 assert len(browser['results'])==24 and all(x['status']=='PASS' for x in browser['results'])
 assert {x['engine'] for x in browser['results']}=={'chromium','firefox','webkit'}
 # The photo-only overlay must preserve all commerce/account bytes exactly.
 web=read('web-preservation.json');assert web.get('passed') is True
 protected=('checkout','cart','payment','order','offer','account','purchase')
 assert not [name for name in web.get('changedFiles',[]) if any(part in name.lower() for part in protected)], 'Commerce/account files changed in photo-only candidate'
 save('sealed.json',{'passed':True,'manifest':manifest,'images':{'api':read('api-preservation.json')['candidateImageId'],'web':r.guard.image_id(r.tag('web'))},'sourceSha':os.environ['GITHUB_SHA'],'photoSourceSha':source_sha()})
def publish():
 r.fresh_source();seal();sealed=read('sealed.json');result={}
 for app in ['api','web']:
  if app=='api':
   image=read('api-preservation.json')['baseImage']
  else:
   subprocess.run(['docker','push',r.tag(app)],check=True)
   image=r.images.REGISTRY+'/hidi-'+app+'@'+r.registry_digest(app)
   subprocess.run(['docker','pull',image],check=True)
  assert r.guard.image_id(image)==sealed['images'][app],'Published artifact differs from tested image'
  result[app]=image
 save('published.json',{'passed':True,'images':result})
def verify():
 sealed=read('sealed.json');assert sealed['sourceSha']==os.environ['GITHUB_SHA'] and sealed['photoSourceSha']==source_sha()
 for name,value in sealed['manifest'].items():assert hashlib.sha256((E/name).read_bytes()).hexdigest()==value
 return read('published.json')['images']
def recover():
 before=r.photo.states();published=verify();captured=r.guard.private_json('public-before.json');results={}
 for app,g in [('web',r.guard),('api',r.api_guard)]:
  marker=P/(app+'-forward.json')
  if not marker.exists():continue
  reference=dict(before);peer='hidi-api' if app=='web' else 'hidi-web';reference[peer]=r.cloud.snapshot(r.cloud.app(peer))
  results[app]=g.reconcile_failure(published[app],reference,captured,captured,'photostream'+app+r.guard.run_key('a'),bool(json.loads(marker.read_text()).get('mayComplete')))
  assert results[app]['passed'],'Owned recovery failed'
 save('recovery.json',{'passed':True,'results':results})
def apply():
 r.fresh_source();r.backups();published=verify();storage=read('azure-storage-test.json')
 assert storage['passed'] and storage.get('validationJobRemoved') is True and storage.get('photoSourceSha')==source_sha() and storage.get('image')==published['web'],'Real managed-identity storage validation and cleanup must pass for this exact source and image'
 before=r.photo.states();r.photo.unchanged(before);captured=r.guard.private_json('public-before.json')
 assert published['api']==before['hidi-api']['image'],'This derivative release must not replace the API image'
 assert r.guard.public_snapshot()==captured;r.guard.install_interrupt_handler();deployed=dict(before)
 try:
  for app,g in [('web',r.guard)]:
   marker=app+'-forward.json';g.write_private(marker,{'attempted':False,'mayComplete':False})
   suffix='photostream'+app+r.guard.run_key('a')
   g.conditional_write_image(r.photo.originals()['hidi-'+app],published[app],suffix,marker)
   deployed['hidi-'+app]=r.cloud.snapshot(g.wait_ready(published[app],suffix,deployed));r.photo.unchanged(deployed)
  for path in ['/','/collections/all','/cart','/checkout','/account','/api/store/health','/api/store/checkout/payment-options']:r.cloud.get(path)
  for path in ['/api/admin/inventory','/api/hidi/offers/admin','/admin/offers']:r.cloud.get(path,401)
  assert json.loads(r.cloud.get('/api/hidi/offers'))==r.guard.private_json('offers-before.json')
  request=urllib.request.Request(r.cloud.BASE+'/api/admin/inventory/photo-probe/images',data=b'--photo-check--\r\n',headers={'Content-Type':'multipart/form-data; boundary=photo-check'},method='POST')
  try:urllib.request.urlopen(request,timeout=30);raise AssertionError('Anonymous photo upload must be denied')
  except urllib.error.HTTPError as e:
   assert e.code==401 and e.headers.get('x-hidi-photo-upload')=='stream-v1','Expected new protected upload handler'
  source='/media/products/variants/cmv508ble011s01z3rygu4as3/1791794828102-2020f682-53ea-42fb-b4d3-fce9959fcbe5.jpg?hidi_image=3'
  from urllib.parse import urlencode
  q=urlencode({'url':source,'w':640,'q':75})
  req=urllib.request.Request(r.cloud.BASE+'/_next/image?'+q,headers={'Accept':'image/webp'})
  with urllib.request.urlopen(req,timeout=60) as response:
   data=response.read(5*1024*1024);assert response.status==200 and response.headers.get('X-Hidi-Image-Version')=='3' and response.headers.get('Content-Type')=='image/webp'
   assert response.headers.get('X-Hidi-Image-Cache')=='PERSISTED','Production image did not use the verified persistent derivative; roll back instead of accepting runtime Sharp fallback'
   image={'bytes':len(data),'widthRequested':640,'format':'WebP','optimizerVersion':3,'cache':'PERSISTED'}
  assert r.guard.public_snapshot()==captured;r.photo.unchanged(deployed)
  save('after.json',{'passed':True,'productionDeployment':True,'states':deployed,'imageSample':image,'checkoutFilesPreserved':True,'sqlSchemaChanged':False,'catalogueRowsChanged':False,'photoSourceSha':source_sha(),'sourceSha':os.environ['GITHUB_SHA']})
 except Exception:
  recover();raise
if __name__=='__main__':
 parser=argparse.ArgumentParser();parser.add_argument('mode',choices=['capture','compose','seal','publish','apply','recover']);args=parser.parse_args();globals()[args.mode]()
