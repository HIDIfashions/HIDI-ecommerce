"""Back up the live images and inspect only product-image delivery code."""
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import tarfile

HERE = Path(__file__).resolve().parent
def load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module

photo = load('collection_photo', HERE.parent / 'photo-upload/release.py')
PRIVATE = Path(os.environ.get('RUNNER_TEMP', '/tmp')) / 'hidi-collection-speed-private'
EVIDENCE = Path('evidence/collection-speed')
photo.PRIVATE, photo.EVIDENCE = PRIVATE, EVIDENCE
photo.cloud.BASE = 'https://hidiindia.com'

def capture():
    photo.capture()
    photo.backup()
    root = PRIVATE / 'web/base-app'
    photo.images.extract(photo.states()['hidi-web']['image'], root)
    files = ['server.mjs', 'apps/web/server.js']
    snippets = {}
    for path in (root / 'apps/web/.next').rglob('*.js'):
        if path.is_file() and path.stat().st_size < 4 * 1024 * 1024:
            text = path.read_text(errors='replace')
            if '/media/products/' in text and 'thidigk.thehidi.com' in text:
                key = path.relative_to(root).as_posix()
                files.append(key)
                marker = text.find('/media/products/')
                snippets[key] = text[max(0, marker - 650):marker + 650]
    with tarfile.open(EVIDENCE / 'runtime-inspection.tar.gz', 'w:gz') as archive:
        for name in files:
            archive.add(root / name, arcname=name)
    (EVIDENCE / 'image-source-snippets.json').write_text(json.dumps(snippets, indent=2))
    script = "const{createRequire}=require('node:module');const r=createRequire(process.argv[1]);const fs=require('node:fs');let p=r.resolve('next/dist/server/image-optimizer.js');console.log(JSON.stringify({path:p,sharpVersion:r('next/dist/server/image-optimizer.js').getSharp(1).versions,nextVersion:r('next/package.json').version}));"
    result = json.loads(subprocess.check_output(['node', '-e', script, str(root / 'apps/web/server.js')], text=True))
    optimizer = Path(result.pop('path'))
    with tarfile.open(EVIDENCE / 'optimizer-inspection.tar.gz', 'w:gz') as archive:
        archive.add(optimizer, arcname='image-optimizer.js')
    result['optimizerRelativePath'] = optimizer.relative_to(root).as_posix()
    result['sourceSha'] = os.environ['GITHUB_SHA']
    result['passed'] = True
    (EVIDENCE / 'runtime-inspection.json').write_text(json.dumps(result, indent=2))
    photo.unchanged(photo.states())
    print('PASS: immutable backups verified and product-image runtime inspected; applications unchanged')

if __name__ == '__main__':
    capture()
