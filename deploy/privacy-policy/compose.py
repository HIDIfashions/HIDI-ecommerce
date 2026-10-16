"""Preserve all live application bytes except the five additive runtime hooks."""
import argparse
import importlib.util
import json
import pathlib
import shutil
import subprocess

here = pathlib.Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('runtime_patch', here / 'patch-runtime.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
spec2 = importlib.util.spec_from_file_location('image_helpers', here.parent / 'compose-msg91-images.py')
helpers = importlib.util.module_from_spec(spec2)
spec2.loader.exec_module(helpers)
FILES = {'handler.mjs', 'defaults.mjs', 'storage.mjs', 'editor.html', 'editor.js', 'links.js', 'policy.css'}

def verify(base, candidate, configs):
    before, after = helpers.fingerprints(base), helpers.fingerprints(candidate)
    assert after['server.mjs'][1] != before['server.mjs'][1]
    assert (candidate / 'server.mjs').read_text() == module.patch((base / 'server.mjs').read_text()), 'Unreviewed runtime modification'
    expected = {'server.mjs'} | {'privacy-policy/' + name for name in FILES}
    changed = {name for name in before.keys() | after.keys() if before.get(name) != after.get(name)}
    assert changed == expected, 'Unexpected application changes: ' + str(sorted(changed ^ expected))
    for name in FILES:
        assert (candidate / 'privacy-policy' / name).read_bytes() == (here / name).read_bytes(), 'Policy payload differs from reviewed source: ' + name
    assert configs[0]['Config'] == configs[1]['Config'], 'Image runtime settings changed'
    layers = configs[0]['RootFS']['Layers']
    assert configs[1]['RootFS']['Layers'][:len(layers)] == layers, 'Original image layers changed'
    return {'passed': True, 'changedFiles': sorted(changed), 'protectedFilesIdentical': len(before) - 1, 'runtimeHooksOnly': True, 'runtimeConfigIdentical': True, 'baseLayersPreserved': True}

def compose(args):
    helpers.validate_image(args.base, 'web')
    work = pathlib.Path(args.work).resolve(); work.mkdir(parents=True, exist_ok=True)
    base, candidate, overlay = work / 'base-app', work / 'candidate-app', work / 'overlay'
    helpers.extract(args.base, base)
    assert all((base / name).is_file() for name in ['server.mjs', 'hero-media.mjs', 'dist/index.html', 'apps/web/server.js'])
    (overlay / 'privacy-policy').mkdir(parents=True)
    for name in FILES: shutil.copyfile(here / name, overlay / 'privacy-policy' / name)
    (overlay / 'server.mjs').write_text(module.patch((base / 'server.mjs').read_text()))
    subprocess.run(['node', '--check', str(overlay / 'server.mjs')], check=True)
    (work / 'Dockerfile').write_text('FROM ' + args.base + '\nCOPY --chown=node:node overlay/ /app/\n')
    subprocess.run(['docker', 'build', '--pull=false', '-t', args.tag, str(work)], check=True)
    helpers.extract(args.tag, candidate)
    result = verify(base, candidate, json.loads(helpers.docker('image', 'inspect', args.base, args.tag)))
    pathlib.Path(args.report).write_text(json.dumps(result, indent=2)); print(json.dumps(result))

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    for name in ['base', 'tag', 'work', 'report']: parser.add_argument('--' + name, required=True)
    compose(parser.parse_args())
