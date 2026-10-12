"""Read only the live web SEO source. No application, SQL or Blob mutations."""
import hashlib, importlib.util, json, os, re, subprocess
from pathlib import Path
raw=subprocess.check_output(['az','containerapp','show','-g','rg-hidi-prod','-n','hidi-web','--only-show-errors','-o','json'],text=True)
data=json.loads(raw); props=data['properties']; image=props['template']['containers'][0]['image']
spec=importlib.util.spec_from_file_location('images',Path('deploy/compose-msg91-images.py')); images=importlib.util.module_from_spec(spec);spec.loader.exec_module(images)
images.validate_image(image,'web')
subprocess.run(['docker','pull',image],check=True)
root=Path(os.environ['RUNNER_TEMP'])/'hidi-seo-inspection'; images.extract(image,root)
source=(root/'server.mjs').read_text()
print('SEO_BASELINE',json.dumps({'image':image,'latest':props.get('latestRevisionName'),'ready':props.get('latestReadyRevisionName'),'serverSha256':hashlib.sha256(source.encode()).hexdigest(),'readOnly':True}))
names=['isProductionRequest','privateSeoPath','shouldNoIndex','canonicalFor','serveRobots','injectSeo','shouldInjectSeo','proxySitemap','proxy']
for name in names:
 match=re.search(r'^(?:async )?function '+name+r'\([^\n]*\) \{',source,re.M)
 if not match: print('SEO_MISSING',name);continue
 end=source.find('\n}\n',match.end());assert end>=0
 print('SEO_FUNCTION',json.dumps({'name':name,'source':source[match.start():end+3]}))
for line in source.splitlines():
 if re.match(r'^const (productionHosts|primarySiteOrigin|primarySiteUrl|indexingEnabled|allowPublicDomain)\b',line):print('SEO_CONSTANT',line)
for match in re.finditer(r'robots\.txt|sitemap\.xml|shouldNoIndex\(request, pathname\)',source):
 print('SEO_CALLSITE',json.dumps(source[max(0,match.start()-150):match.end()+180]))
print('PASS: read-only SEO inspection completed')
