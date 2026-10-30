"""Capture public assets plus versioned source; construct a local review, no cloud writes."""
from pathlib import Path
import importlib.util,json,re,subprocess,sys,urllib.request
HERE=Path(__file__).resolve().parent
out=Path(sys.argv[1]).resolve();out.mkdir(parents=True,exist_ok=True)
base=out/'baseline';(base/'dist').mkdir(parents=True,exist_ok=True)
source_sha=subprocess.check_output(['git','rev-parse','origin/hidi-web-new'],text=True).strip()
for name,path in [('hero-media.mjs','deploy/hidi-web-new/hero-media.mjs'),('dist/landing-media-control.html','apps/web/public/landing-media-control.html')]:
    (base/name).write_bytes(subprocess.check_output(['git','show',source_sha+':'+path]))
def get(path):
    with urllib.request.urlopen('https://hidiindia.com'+path,timeout=45) as response:return response.read()
html=get('/');(base/'dist/index.html').write_bytes(html)
refs=re.findall(rb'(?:src|href)="(/assets/[^"?]+)"',html)
for ref in set(refs):
    name=ref.decode().lstrip('/');target=base/'dist'/name;target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(get('/'+name))
snapshot={path:json.loads(get(path)) for path in ['/api/hidi/hero-config','/api/hidi/landing-media-config','/api/hidi/offers/checkout-policy','/api/store/checkout/payment-options']}
(out/'public-before.json').write_text(json.dumps(snapshot,indent=2),encoding='utf-8')
spec=importlib.util.spec_from_file_location('patch',HERE/'patch-runtime.py');patch=importlib.util.module_from_spec(spec);spec.loader.exec_module(patch)
report=patch.patch_runtime(base,out/'candidate');report['adminAndServerSource']=source_sha;report['homepageSource']='captured public production assets';report['notDeployed']=True
(out/'patch-report.json').write_text(json.dumps(report,indent=2));print(json.dumps(report,indent=2))
