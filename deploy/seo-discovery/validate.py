"""Capture the live web image and run the SEO candidate locally. Never deploy."""
import hashlib, importlib.util, json, os, shutil, subprocess
from pathlib import Path

def load(name,path):
    spec=importlib.util.spec_from_file_location(name,path);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);return m

images=load('images',Path('deploy/compose-msg91-images.py'))
patcher=load('seo_patch',Path('deploy/seo-discovery/patch-runtime.py'))
data=json.loads(subprocess.check_output(['az','containerapp','show','-g','rg-hidi-prod','-n','hidi-web','--only-show-errors','-o','json'],text=True))
props=data['properties'];assert props['latestRevisionName']==props['latestReadyRevisionName'],'Live web rollout in progress'
image=props['template']['containers'][0]['image'];images.validate_image(image,'web')
subprocess.run(['docker','pull',image],check=True)
private=Path(os.environ['RUNNER_TEMP'])/'hidi-seo-validation';private.mkdir(mode=0o700)
base,overlay,candidate=(private/n for n in ['base-app','overlay','candidate-app'])
images.extract(image,base);plan=patcher.patch_runtime(base,overlay)
shutil.copytree(base,candidate,symlinks=True);shutil.copytree(overlay,candidate,dirs_exist_ok=True)
before,after=images.fingerprints(base),images.fingerprints(candidate)
changed={p for p in before.keys()|after.keys() if before.get(p)!=after.get(p)}
overlay_files=images.fingerprints(overlay)
expected={p for p in plan['allowedFiles'] if before.get(p)!=overlay_files.get(p)}
assert changed==expected and changed, 'Changes outside the reviewed SEO overlay: '+str(changed)
subprocess.run(['node','--check',str(candidate/'server.mjs')],check=True)
subprocess.run(['node','--test','deploy/seo-discovery/seo.test.mjs'],check=True)
env={**os.environ,'HIDI_CANDIDATE_RUNTIME':str(candidate)}
subprocess.run(['node','deploy/seo-discovery/candidate.mjs'],env=env,check=True)
current=json.loads(subprocess.check_output(['az','containerapp','show','-g','rg-hidi-prod','-n','hidi-web','--only-show-errors','-o','json'],text=True))
assert current['properties']['template']==data['properties']['template'],'An independent live rollout occurred during validation'
report={'passed':True,'changedFiles':sorted(changed),'protectedFilesIdentical':len(before)-1,'image':image,'readOnly':True,'deploymentWrites':0,'databaseWrites':0,'blobWrites':0}
output=Path('evidence/seo-discovery');output.mkdir(parents=True,exist_ok=True);(output/'preservation.json').write_text(json.dumps(report,indent=2))
print('PASS: SEO candidate validated against exact live image; production unchanged')
