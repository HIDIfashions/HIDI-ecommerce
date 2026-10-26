import importlib.util,json,pathlib
ROOT=pathlib.Path(__file__).resolve().parent
def load(name,path):
    spec=importlib.util.spec_from_file_location(name,path);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);return m
cloud=load('cod_review_cloud',ROOT.parent/'privacy-policy/rollout.py')
console=load('cod_review_console',ROOT.parent/'delivery-sync/console.py')
app=cloud.app('hidi-api');cloud.ready(cloud.snapshot(app))
sealed=console.run(app,(ROOT/'query.mjs').read_text())
assert sealed.get('encrypted') is True
pathlib.Path('encrypted-cod-review.json').write_text(json.dumps(sealed))
print('Read-only COD review lookup completed; encrypted report produced. No records changed.')
