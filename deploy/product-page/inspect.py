"""Read-only capture of the retained product route; never deploys an image."""
import importlib.util
import json
import os
from pathlib import Path
import shutil

root = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('pdp_photo', root / 'photo-upload/release.py')
photo = importlib.util.module_from_spec(spec)
spec.loader.exec_module(photo)
private = Path(os.environ['RUNNER_TEMP']) / 'hidi-product-page-inspect'
out = Path('evidence/product-page-release/inspection')
photo.PRIVATE = private
photo.EVIDENCE = Path('evidence/product-page-release')
photo.capture()
before = photo.states()
base = private / 'base-app'
photo.images.extract(before['hidi-web']['image'], base)
out.mkdir(parents=True, exist_ok=True)
paths = ['apps/web/.next/server', 'apps/web/.next/static',
         'apps/web/.next/build-manifest.json', 'apps/web/.next/app-build-manifest.json',
         'apps/web/.next/BUILD_ID', 'apps/web/package.json']
(out / 'layout.json').write_text(json.dumps([
    {'path': p.relative_to(base).as_posix(), 'link': str(p.readlink()) if p.is_symlink() else None}
    for p in base.rglob('*') if len(p.relative_to(base).parts) <= 4
    and 'node_modules' not in p.parts and p.name not in {'.env', '.env.local', '.env.production'}
], indent=2))
paths += ['.next/server', '.next/static', '.next/build-manifest.json',
          '.next/app-build-manifest.json', '.next/BUILD_ID']
for name in paths:
    source = base / name
    if source.is_dir():
        shutil.copytree(source, out / name)
    elif source.is_file():
        (out / name).parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(source, out / name)
photo.unchanged(before)
(out / 'capture.json').write_text(json.dumps({'passed': True, 'states': before,
    'sourceSha': os.environ['GITHUB_SHA'], 'productionWrites': 0}, indent=2))
