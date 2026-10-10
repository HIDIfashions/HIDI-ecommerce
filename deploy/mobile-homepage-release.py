"""Add only a versioned responsive stylesheet and its link to the live homepage."""
import argparse, hashlib, importlib.util, json, os, pathlib, re, shutil, subprocess
ROOT=pathlib.Path(__file__).resolve().parent
def load(name,path):
 s=importlib.util.spec_from_file_location(name,path);m=importlib.util.module_from_spec(s);s.loader.exec_module(m);return m
helpers=load('image_helpers',ROOT/'compose-msg91-images.py')
rollout=load('rollout_helpers',ROOT/'privacy-policy/rollout.py')
evidence=pathlib.Path('evidence');evidence.mkdir(exist_ok=True)
private=pathlib.Path(os.environ.get('RUNNER_TEMP','/tmp'))/'mobile-homepage-private';private.mkdir(exist_ok=True);private.chmod(0o700)
def write(name,value): (evidence/name).write_text(json.dumps(value,indent=2))
def capture():
 states={}
 for name in ['hidi-web','hidi-api']:
  data=rollout.app(name);state=rollout.snapshot(data);rollout.ready(state)
  helpers.validate_image(state['image'],name.removeprefix('hidi-'))
  p=private/(name+'.json');p.write_text(json.dumps(data));p.chmod(0o600);states[name]=state
 write('before.json',states)
 with open(os.environ['GITHUB_ENV'],'a') as f:f.write('EXPECTED_WEB='+states['hidi-web']['image']+'\n')
 print('Ready release captured; settings retained privately; rollback image recorded')
def compose(css_path,tag):
 old=json.loads((private/'hidi-web.json').read_text());base=rollout.snapshot(old)['image']
 helpers.extract(base,private/'base-app')
 folder=private/'base-app';assert (folder/'apps/web/server.js').is_file() and (folder/'dist/index.html').is_file()
 # Keep the current deployed bundles, including concurrent performance/social releases.
 # The exact composed image must pass the three-engine homepage suite before rollout.
 # Comparing a stale source build here would block an additive CSS-only release.
 live_html=(folder/'dist/index.html').read_text()
 asset_refs=re.findall(r'(?:src|href)=[\"\'](?:\./|/)(assets/index-[^\"\']+\.(?:js|css))[\"\']',live_html)
 assert len(asset_refs)>=2 and all((folder/'dist'/p).is_file() for p in asset_refs),'Live homepage bundles are missing'
 css=pathlib.Path(css_path).read_bytes();name='homepage-responsive-'+hashlib.sha256(css).hexdigest()[:16]+'.css'
 old_html=(folder/'dist/index.html').read_text();assert old_html.lower().count('</head>')==1
 assert 'data-hidi-homepage-responsive' not in old_html,'Responsive release already installed'
 new_html=re.sub(r'</head>',f'<link rel="stylesheet" data-hidi-homepage-responsive href="/{name}">\n</head>',old_html,count=1,flags=re.I)
 overlay=private/'overlay/dist';overlay.mkdir(parents=True)
 (overlay/name).write_bytes(css);(overlay/'index.html').write_text(new_html)
 (private/'Dockerfile').write_text('FROM '+base+'\nCOPY --chown=node:node overlay/ /app/\n')
 subprocess.run(['docker','build','--pull=false','-t',tag,str(private)],check=True)
 helpers.extract(tag,private/'candidate-app')
 a,b=helpers.fingerprints(folder),helpers.fingerprints(private/'candidate-app')
 allowed={'dist/index.html','dist/'+name};delta={k for k in a.keys()|b.keys() if a.get(k)!=b.get(k)}
 assert delta==allowed,'Unreviewed shopping, media, admin or runtime change: '+str(delta^allowed)
 assert (private/'candidate-app/dist/index.html').read_text()==new_html
 configs=json.loads(helpers.docker('image','inspect',base,tag));assert configs[0]['Config']==configs[1]['Config']
 layers=configs[0]['RootFS']['Layers'];assert configs[1]['RootFS']['Layers'][:len(layers)]==layers
 write('preservation.json',{'passed':True,'protectedFilesIdentical':len(a)-1,'changedFiles':sorted(delta),'runtimeConfigIdentical':True,'originalLayersPreserved':True,'cssFilename':name,'cssSha256':hashlib.sha256(css).hexdigest()})
 print('Only the homepage stylesheet and its link change; '+str(len(a)-1)+' existing files remain identical')
def public_state():
 return {p:hashlib.sha256(rollout.get(p)).hexdigest() for p in ['/api/hidi/hero-config','/api/hidi/landing-media-config','/api/hidi/privacy-policy','/privacy']}
def apply(candidate):
 helpers.validate_image(candidate,'web')
 old={n:json.loads((private/(n+'.json')).read_text()) for n in ['hidi-web','hidi-api']};before={n:rollout.snapshot(v) for n,v in old.items()}
 for n in old:assert rollout.snapshot(rollout.app(n))==before[n],'Another deployment changed the release; stop instead of overwriting it'
 public=public_state();changed=False
 try:
  changed=True;suffix='mobilehome'+os.environ['GITHUB_RUN_ID'];rollout.write_image(old['hidi-web'],candidate,suffix)
  current=rollout.snapshot(rollout.wait_ready(candidate,suffix));assert current['settingsHash']==before['hidi-web']['settingsHash']
  for p in ['/health','/healthz','/api/store/health/ready','/collections/all','/cart','/account','/wishlist','/checkout','/admin','/admin/products/price-tags','/admin/landing-media','/admin/packing-scanner','/admin/privacy-policy']:rollout.get(p)
  for p in ['/api/hidi/privacy-policy/admin','/api/hidi/hero-library','/api/hidi/landing-media-library']:rollout.get(p,401)
  assert public_state()==public,'Published media or privacy content changed during rollout'
  report=json.loads((evidence/'preservation.json').read_text());assert hashlib.sha256(rollout.get('/'+report['cssFilename'])).hexdigest()==report['cssSha256']
  assert ('href="/'+report['cssFilename']+'"').encode() in rollout.get('/')
  # A read-only real-site regression is part of the rollback boundary.
  subprocess.run(['node','deploy/mobile-homepage-live.mjs'],check=True,timeout=540)
  after={n:rollout.snapshot(rollout.app(n)) for n in old};assert after['hidi-api']==before['hidi-api']
  assert after['hidi-web']['settingsHash']==before['hidi-web']['settingsHash'];rollout.ready(after['hidi-web'])
  write('after.json',{'states':after,'publishedContentPreserved':True,'apiUnchanged':True,'settingsUnchanged':True})
  print('PASS: image deployed, customer routes healthy, live responsive regression passed; API, settings and published media/policy preserved')
 except Exception:
  if changed:
   data=rollout.app('hidi-web');state=rollout.snapshot(data)
   if state['image']==candidate and state['settingsHash']==before['hidi-web']['settingsHash']:
    suffix='mobilehomerollback'+os.environ['GITHUB_RUN_ID'];rollout.write_image(data,before['hidi-web']['image'],suffix);rollout.wait_ready(before['hidi-web']['image'],suffix)
    write('rollback.json',{'restored':True,'image':before['hidi-web']['image']});print('Release verification failed; original image restored')
   else:print('Live release changed independently; refusing to overwrite it')
  raise
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('action',choices=['capture','compose','apply']);p.add_argument('--css');p.add_argument('--image');a=p.parse_args()
 if a.action=='capture':capture()
 elif a.action=='compose':compose(a.css,a.image)
 else:apply(a.image)
