"""Fresh retained-runtime inspection for batch product saving and publication."""
import argparse
import importlib.util
import json
import os
from pathlib import Path
import tarfile

HERE = Path(__file__).resolve().parent
PRIVATE = Path(os.environ.get('RUNNER_TEMP', '/tmp')) / 'hidi-bulk-publish-private'
EVIDENCE = Path('evidence/bulk-publish')

def load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module)
    return module

photo = load('bulk_publish_photo', HERE.parent / 'photo-upload/release.py')
cloud, images = photo.cloud, photo.images
cloud.BASE = 'https://hidiindia.com'

def setup():
    photo.PRIVATE, photo.EVIDENCE = PRIVATE, EVIDENCE
    EVIDENCE.mkdir(parents=True, exist_ok=True)

def inspect():
    setup(); photo.capture(); photo.backup()
    counts = {}
    for app in ('web', 'api'):
        root = PRIVATE / app / 'base-app'
        images.extract(photo.states()['hidi-' + app]['image'], root)
        selected = []
        if app == 'web':
            selected = ['server.mjs']
            selected += [file.relative_to(root).as_posix() for file in (root / 'admin-tools').rglob('*') if file.is_file()]
            for file in (root / 'apps/web/.next').rglob('*'):
                if file.is_file() and file.suffix in ('.js', '.json', '.html', '.rsc') and file.stat().st_size < 4 * 1024 * 1024:
                    value = file.read_text(errors='replace')
                    if 'Products remain Draft' in value or '/admin/import' in file.as_posix():
                        selected.append(file.relative_to(root).as_posix())
        else:
            selected = ['apps/api/dist/admin/products/admin-products.service.js', 'apps/api/dist/admin/products/product-input.js']
        with tarfile.open(EVIDENCE / (app + '-inspection.tar.gz'), 'w:gz') as archive:
            for name in selected:
                assert (root / name).is_file(), 'Retained module missing: ' + name
                archive.add(root / name, arcname=name)
        counts[app] = len(selected)
    photo.unchanged(photo.states())
    photo.save('inspection.json', {'passed': True, 'files': counts, 'productionWrites': False})
    print('PASS: fresh production backups and bulk import modules captured without production writes')

if __name__ == '__main__':
    parser = argparse.ArgumentParser(); parser.add_argument('mode', choices=['inspect']); args = parser.parse_args()
    try: globals()[args.mode]()
    except Exception as error:
        print(str(error) if isinstance(error, (AssertionError, cloud.AzureOperationError)) else 'Bulk inspection stopped; inspect bounded evidence')
        raise SystemExit(1)
