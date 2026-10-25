"""Read production runtime and configuration to prepare a minimal overlay. No cloud writes."""
import importlib.util,json,os,pathlib,shutil,subprocess
ROOT=pathlib.Path(__file__).resolve().parent
def load(name,path):
    spec=importlib.util.spec_from_file_location(name,path);module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module);return module
cloud=load('delivery_cloud',ROOT.parent/'privacy-policy/rollout.py')
images=load('delivery_images',ROOT.parent/'compose-msg91-images.py')
console=load('delivery_console',ROOT/'console.py')
work=pathlib.Path(os.environ['RUNNER_TEMP'])/'delivery-inspect';work.mkdir()
evidence=pathlib.Path('evidence/delivery-sync-inspect');evidence.mkdir(parents=True)
states={}
for name in ['hidi-api','hidi-web']:
    data=cloud.app(name);state=cloud.snapshot(data);cloud.ready(state);states[name]=state
    subprocess.run(['docker','pull',state['image']],check=True)
    base=work/name;images.extract(state['image'],base)
    if name=='hidi-api':
        paths=[base/('apps/api/dist/'+p+'.js') for p in ['admin/admin.service','admin/admin.controller','delhivery/delhivery.service','delhivery/delhivery.module']]
        report=console.run(data,(ROOT/'inspect.mjs').read_text())
        report['minReplicas']=data['properties']['template'].get('scale',{}).get('minReplicas',0)
        (evidence/'readiness.json').write_text(json.dumps(report,indent=2));print(json.dumps(report))
    else:
        paths=[base/'server.mjs',base/'apps/web/.next/server/app/admin/orders/[orderNumber]/page.js',base/'apps/web/.next/server/app/api/admin/orders/[orderNumber]/status/route.js',base/'apps/web/.next/server/app-paths-manifest.json']
        paths+=list((base/'apps/web/.next/static/chunks/app/admin/orders').rglob('*.js'))
    for file in paths:
        if not file.is_file(): continue
        target=evidence/'runtime'/file.relative_to(base);target.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(file,target)
    assert cloud.snapshot(cloud.app(name))==state
(evidence/'states.json').write_text(json.dumps(states,indent=2))
