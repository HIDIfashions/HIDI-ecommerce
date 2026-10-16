"""Compose notification files over the exact live API; verify all other bytes and configuration."""
import argparse, importlib.util, json, shutil, subprocess
from pathlib import Path
spec = importlib.util.spec_from_file_location('existing_compose', 'deploy/compose-msg91-images.py')
existing = importlib.util.module_from_spec(spec); spec.loader.exec_module(existing)

IMPORT = 'import { OrderNotificationModule } from "./order-notifications/order-notification.module.js";'
def patch_module(source):
    if 'OrderNotificationModule' in source:
        assert source.count(IMPORT) == 1 and source.count('MarketingModule, OrderNotificationModule]') == 1, 'Installed notification registration changed; review before composing'
        return source
    anchor = 'import { MarketingModule } from "./marketing/marketing.module.js";'
    assert source.count(anchor) == 1 and source.count('MarketingModule]') == 1, 'Live module structure changed; review before composing'
    changed = source.replace(anchor, anchor + '\n' + IMPORT).replace('MarketingModule]', 'MarketingModule, OrderNotificationModule]')
    restored = changed.replace('\n' + IMPORT, '').replace('MarketingModule, OrderNotificationModule]', 'MarketingModule]')
    assert restored == source, 'Existing module bytes must be preserved'
    return changed

def verify(base, candidate, configs):
    old, new = existing.fingerprints(base), existing.fingerprints(candidate)
    delta = {p for p in old.keys() | new.keys() if old.get(p) != new.get(p)}
    module = 'apps/api/dist/app.module.js'
    assert delta and all(p == module or p.startswith('apps/api/dist/order-notifications/') for p in delta), 'API changed outside notification module registration and its files'
    for path in old:
        if path != module and not path.startswith('apps/api/dist/order-notifications/'):
            assert new.get(path) == old[path], 'Existing application bytes changed: ' + path
    before, after = configs
    assert before['Config'] == after['Config'], 'Docker runtime configuration changed'
    assert after['RootFS']['Layers'][:len(before['RootFS']['Layers'])] == before['RootFS']['Layers'], 'Live base layers changed'
    protected = sum(1 for path in old if path != module and not path.startswith('apps/api/dist/order-notifications/'))
    return {'passed': True, 'changedFiles': sorted(delta), 'existingFilesIdentical': protected, 'dockerConfigPreserved': True, 'baseLayersPreserved': True}

def compose(args):
    existing.validate_image(args.base, 'api')
    work = Path(args.work); work.mkdir(parents=True, exist_ok=True)
    base, candidate, overlay = work/'base-app', work/'candidate-app', work/'overlay'
    existing.extract(args.base, base)
    target = overlay/'apps/api/dist'; target.mkdir(parents=True, exist_ok=True)
    (target/'app.module.js').write_text(patch_module((base/'apps/api/dist/app.module.js').read_text()))
    shutil.copytree('apps/api/dist/order-notifications', target/'order-notifications')
    (work/'Dockerfile').write_text('FROM '+args.base+'\nCOPY --chown=node:node overlay/ /app/\n')
    subprocess.run(['docker','build','--pull=false','-t',args.tag,str(work)],check=True)
    existing.extract(args.tag,candidate)
    result = verify(base,candidate,json.loads(existing.docker('image','inspect',args.base,args.tag)))
    Path(args.report).write_text(json.dumps(result,indent=2)); print(json.dumps(result))

if __name__ == '__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    for key in ['base','tag','work','report']: parser.add_argument('--'+key,required=True)
    compose(parser.parse_args())
