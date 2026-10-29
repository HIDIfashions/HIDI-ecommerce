"""Test exact immutable live image files without Docker's layer-depth limit."""
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys

spec = importlib.util.spec_from_file_location('welcome_release', Path(__file__).resolve().parent.parent / 'checkout-offers/release.py')
release = importlib.util.module_from_spec(spec)
spec.loader.exec_module(release)

def unpack():
    release.fresh_source()
    release.backups()
    before = release.photo.states()
    authfile = Path(os.environ.get('DOCKER_CONFIG', str(Path.home() / '.docker'))) / 'config.json'
    for app in ['api', 'web']:
        folder = release.P / app
        folder.mkdir()
        layout, bundle = folder / 'oci', folder / 'unpacked'
        original = before['hidi-' + app]['image']
        subprocess.run(['skopeo', 'copy', '--preserve-digests', '--authfile', str(authfile), 'docker://' + original, 'oci:' + str(layout) + ':runtime'], check=True)
        index = json.loads((layout / 'index.json').read_text())
        assert index['manifests'][0]['digest'] == original.split('@')[1], 'Image digest changed during copy'
        subprocess.run(['umoci', 'unpack', '--rootless', '--image', str(layout) + ':runtime', str(bundle)], check=True)
        runtime = bundle / 'rootfs/app'
        assert runtime.is_dir()
        (folder / 'candidate-app').symlink_to(runtime, target_is_directory=True)
        overlay = folder / 'comparison'
        plan = release.patch.patch_runtime(runtime, overlay, app)
        assert all((runtime / name).is_file() and (runtime / name).read_bytes() == (overlay / name).read_bytes() for name in plan['allowedFiles']), 'Live runtime differs from reviewed coupon implementation'
        fingerprints = release.images.fingerprints(runtime)
        release.save(app + '-preservation.json', {'passed': True, 'unchanged': True, 'image': original, 'changedFiles': [], 'files': len(fingerprints), 'fingerprint': hashlib.sha256(json.dumps(fingerprints, sort_keys=True).encode()).hexdigest()})
    release.photo.unchanged(before)

def verify():
    release.fresh_source()
    release.photo.unchanged(release.photo.states())
    for app in ['api', 'web']:
        report = release.read(app + '-preservation.json')
        assert report['passed'] and report['unchanged']
        assert release.photo.states()['hidi-' + app]['image'] == report['image']
    for name in ['api-checkout.json', 'candidate/report.json', 'purchase-regression/report.json']:
        assert release.read(name)['passed'], name
    release.save('sealed.json', {'passed': True, 'exactLiveRuntime': True, 'applicationChanges': 0, 'sourceSha': os.environ['GITHUB_SHA']})

if __name__ == '__main__':
    {'unpack': unpack, 'verify': verify}[sys.argv[1]]()
