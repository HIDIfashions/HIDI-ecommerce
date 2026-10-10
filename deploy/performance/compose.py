"""Overlay the reviewed changes on the backed-up live image; preserve every other byte."""
import argparse
import importlib.util
import json
from pathlib import Path
import shutil
import subprocess

HERE = Path(__file__).resolve().parent
def module(name, path):
    spec = importlib.util.spec_from_file_location(name, path); value = importlib.util.module_from_spec(spec); spec.loader.exec_module(value); return value
helpers = module('image_helpers', HERE.parent / 'compose-msg91-images.py')
runtime = module('performance_runtime', HERE / 'patch-runtime.py')

def main(args):
    helpers.validate_image(args.base, 'web'); assert '@sha256:' in args.base
    work = Path(args.work).resolve(); work.mkdir(parents=True, mode=0o700)
    base, candidate, overlay = (work / name for name in ['base-app', 'candidate-app', 'overlay'])
    helpers.extract(args.base, base)
    old = helpers.fingerprints(base)
    assert all((base / name).is_file() for name in ['server.mjs','hero-media.mjs','dist/index.html','apps/web/server.js','privacy-policy/handler.mjs'])
    before, after = Path(args.landing_before)/'apps/web/dist', Path(args.landing_after)/'apps/web/dist'
    before_hashes, after_hashes = helpers.fingerprints(before), helpers.fingerprints(after)
    assert all(old.get('dist/'+key)==value for key,value in before_hashes.items()), 'Live landing does not match the social release baseline'
    landing_delta = {key for key in after_hashes if before_hashes.get(key)!=after_hashes[key]}
    assert 'index.html' in landing_delta and len(landing_delta) <= 8
    assert all(key=='index.html' or key.startswith('assets/index-') or key.startswith('assets/images/performance/banner-') for key in landing_delta), landing_delta
    for key in landing_delta:
        dest=overlay/'dist'/key;dest.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(after/key,dest)
    helpers.copy_web_overlay(Path('apps/web/.next/standalone'), Path('apps/web/.next/static'), overlay)
    (overlay/'server.mjs').write_text(runtime.patch((base/'server.mjs').read_text()))
    shutil.copytree(HERE/'public', overlay/'performance/public')
    for name in ['delivery.mjs','metrics.mjs']: shutil.copyfile(HERE/name, overlay/'performance'/name)
    assert (base/'apps/web/public/brand/hidi-logo-header.svg').read_bytes()==(overlay/'performance/public/logo.svg').read_bytes(), 'Logo source changed since capture'
    (overlay/'privacy-policy').mkdir();shutil.copyfile(HERE.parent/'privacy-policy/links.js',overlay/'privacy-policy/links.js')
    subprocess.run(['node','--check',str(overlay/'server.mjs')],check=True)
    (work/'Dockerfile').write_text('FROM '+args.base+'\nCOPY --chown=node:node overlay/ /app/\n')
    subprocess.run(['docker','build','--pull=false','-t',args.tag,str(work)],check=True)
    helpers.extract(args.tag,candidate)
    new=helpers.fingerprints(candidate); payload=helpers.fingerprints(overlay)
    changed={key for key in old.keys()|new.keys() if old.get(key)!=new.get(key)}
    assert changed and changed<=payload.keys(), 'Unexpected files changed outside the reviewed overlay'
    assert all(new.get(key)==value for key,value in payload.items()), 'Candidate differs from tested payload'
    assert all(key.startswith('apps/web/.next/') or key=='apps/web/server.js' or key in {'server.mjs','privacy-policy/links.js'} or key.startswith('performance/') or key in {'dist/'+item for item in landing_delta} for key in changed)
    assert all(new.get(key)==value for key,value in old.items() if key not in payload), 'Protected application bytes changed'
    configs=json.loads(helpers.docker('image','inspect',args.base,args.tag))
    assert configs[0]['Config']==configs[1]['Config'], 'Runtime configuration changed'
    layers=configs[0]['RootFS']['Layers'];assert configs[1]['RootFS']['Layers'][:len(layers)]==layers
    report={'passed':True,'baseImage':args.base,'protectedFilesIdentical':len(old)-len(changed & old.keys()),'changedFiles':sorted(changed),'landingDelta':sorted(landing_delta),'apiUntouched':True,'runtimeConfigIdentical':True,'baseLayersPreserved':True}
    Path(args.report).write_text(json.dumps(report,indent=2));print(json.dumps({key:value for key,value in report.items() if key!='changedFiles'}))

if __name__=='__main__':
    parser=argparse.ArgumentParser()
    for name in ['base','tag','work','report','landing-before','landing-after']:parser.add_argument('--'+name,required=True)
    main(parser.parse_args())
