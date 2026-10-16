"""Read an existing image and build a local-only candidate; never publish or deploy."""
import importlib.util,json,os,subprocess
from pathlib import Path
here=Path(__file__).resolve().parent
def load(name,path):
 spec=importlib.util.spec_from_file_location(name,path);module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module);return module
release=load('header_release',here/'release.py')
image='acrhidiprod0927.azurecr.io/hidi-web@sha256:98440c094f35b569b11b7b2b7737f34d6368e5b78bb53359f6696f8c21718676'
subprocess.run(['docker','pull',image],check=True)
folder=Path(os.environ['RUNNER_TEMP'])/'header-debug';folder.mkdir()
base,overlay=folder/'base-app',folder/'overlay'
release.images.extract(image,base)
plan=release.patcher.patch_runtime(base,overlay)
(folder/'Dockerfile').write_text('FROM '+image+'\nCOPY --chown=node:node overlay/ /app/\n')
tag='header-debug:local'
subprocess.run(['docker','build','--pull=false','-t',tag,str(folder)],check=True)
release.save('patch.json',plan)
release.save('web-preservation.json',{'baseImage':image,'candidateTag':tag,'debugOnly':True})
# The production diagnostic wrapper is focused; this reviewed branch expands
# only local tests, retaining the exact canonical full matrix and assertions.
(here/'probes-full.mjs').write_bytes((here/'probes.mjs').read_bytes())
subprocess.run(['node','/tmp/header-debug/node_modules/playwright/cli.js','install','--with-deps','firefox','webkit'],check=True)
