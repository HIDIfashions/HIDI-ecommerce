"""Read only deployed public runtime files; never export environment or customer data."""
import importlib.util,json,pathlib,os,hashlib,re
def load(name,path):
    s=importlib.util.spec_from_file_location(name,path);m=importlib.util.module_from_spec(s);s.loader.exec_module(m);return m
cloud=load('cloud','deploy/privacy-policy/rollout.py');cloud.API_VERSION='2025-07-01'
images=load('images','deploy/compose-msg91-images.py')
out=pathlib.Path('evidence/seo-document-inspection');out.mkdir(parents=True)
states={name:cloud.snapshot(cloud.app(name)) for name in ['hidi-api','hidi-web']}
for state in states.values():cloud.ready(state)
root=pathlib.Path(os.environ['RUNNER_TEMP'])/'seo-document-inspect';images.extract(states['hidi-web']['image'],root)
names=['server.mjs','seo-discovery/metadata.mjs','seo-discovery/sitemap.mjs','dist/index.html']
html=(root/'dist/index.html').read_text()
names += ['dist/'+s.lstrip('/') for s in re.findall(r'(?:src|href)="(/assets/[^"?]+\.(?:js|css))',html)]
manifest={}
for name in names:
    path=root/name
    assert path.is_file(),name
    dest=out/name;dest.parent.mkdir(parents=True,exist_ok=True);dest.write_bytes(path.read_bytes())
    manifest[name]=hashlib.sha256(path.read_bytes()).hexdigest()
(out/'baseline.json').write_text(json.dumps({'states':states,'files':manifest,'readOnly':True},indent=2))
print('PASS: deployed public runtime inspected without writes')
