"""Independent customer category release over freshly captured Azure runtimes."""
import argparse
import importlib.util
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import tarfile

HERE = Path(__file__).resolve().parent
PRIVATE = Path(os.environ.get('RUNNER_TEMP', '/tmp')) / 'hidi-four-categories-private'
EVIDENCE = Path('evidence/four-categories')

def load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module)
    return module

photo = load('four_category_photo', HERE.parent / 'photo-upload/release.py')
cloud, images = photo.cloud, photo.images

def setup():
    photo.PRIVATE, photo.EVIDENCE = PRIVATE, EVIDENCE
    EVIDENCE.mkdir(parents=True, exist_ok=True)

def inspect():
    setup(); photo.capture(); photo.backup()
    collected = []
    for app in ('web', 'api'):
        root = PRIVATE / app / 'base-app'
        images.extract(photo.states()['hidi-' + app]['image'], root)
        selected = []
        if app == 'api':
            selected = ['apps/api/dist/products/products.service.js', 'apps/api/dist/products/products.service.js.map']
        else:
            index = root / 'dist/index.html'
            assert index.is_file(), 'Combined landing runtime required'
            selected = ['dist/index.html', 'server.mjs']
            for file in (root / 'dist/assets').glob('index-*.js'):
                if file.name in index.read_text(): selected.append(file.relative_to(root).as_posix())
            for file in (root / 'apps/web/.next').rglob('*'):
                if file.is_file() and file.suffix in ('.js', '.json', '.html', '.rsc') and file.stat().st_size < 4 * 1024 * 1024:
                    value = file.read_text(errors='replace')
                    if any(word in value for word in ('New Arrivals', 'Workwear Edit', 'Occasion', 'Everyday', 'Suggested searches')):
                        selected.append(file.relative_to(root).as_posix())
        with tarfile.open(EVIDENCE / (app + '-inspection.tar.gz'), 'w:gz') as archive:
            for name in selected:
                assert (root / name).is_file(), 'Required retained inspection module missing'
                archive.add(root / name, arcname=name)
        collected.append({'app': app, 'files': len(selected)})
    photo.unchanged(photo.states())
    photo.save('inspection.json', {'passed': True, 'captured': collected, 'liveApplicationsUnchanged': True, 'databaseWrites': False, 'blobWrites': False})
    print('PASS: immutable image/configuration backups and retained category modules captured; no production changes')

if __name__ == '__main__':
    parser = argparse.ArgumentParser(); parser.add_argument('mode', choices=['inspect']); args = parser.parse_args()
    try: inspect()
    except Exception as error:
        print(str(error) if isinstance(error, (AssertionError, cloud.AzureOperationError)) else 'Category inspection stopped; inspect bounded evidence')
        raise SystemExit(1)
