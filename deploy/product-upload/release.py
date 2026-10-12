"""Release the Admin uploader and a verified storage retry repair; never change API or data."""
import argparse
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[1]
BASELINE = 'e6d8ab4e824b6f28d80f82b2e9c6e5081670dcf4'
PRIVATE = Path(os.environ.get('RUNNER_TEMP', '/tmp')) / 'hidi-product-upload-private'
EVIDENCE = Path('evidence/product-upload')
ENGINES = {'chromium', 'firefox', 'webkit'}
VIEWPORTS = {(320, 568), (390, 844), (844, 390), (1440, 900)}
REPORT_PATHS = {
    'patch': 'patch.json',
    'preservation': 'web-preservation.json',
    'uploader': 'candidate/report.json',
    'adminRuntime': 'admin-runtime.json',
    'apiImages': 'api-images.json',
    'apiProducts': 'api-products.json',
    'nextHash': 'next-hash.json',
    'adminDeletion': 'admin-deletion.json',
    'retainedCommerce': 'retained-commerce.json',
    'retainedCommerceProvenance': 'retained-commerce-provenance.json',
}
RETAINED_SOURCES = ['deploy/seo-discovery/candidate.mjs', 'deploy/seo-discovery/probes.mjs',
                    'deploy/button-states/request-policy.mjs']


def load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


guard = load('product_upload_cloud_guard', HERE.parent / 'range-five/release.py')
photo, cloud, images = guard.photo, guard.cloud, guard.images
patcher = load('product_upload_patcher', HERE / 'patch-runtime.py')
cloud.BASE = 'https://hidiindia.com'


def setup():
    guard.PRIVATE, guard.EVIDENCE = PRIVATE, EVIDENCE
    guard.setup()


def save(name, value):
    destination = EVIDENCE / name
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(json.dumps(value, indent=2) + '\n')


def read(name):
    return json.loads((EVIDENCE / name).read_text())


def sha256(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def run_key():
    return guard.run_key()


def suffix():
    return 'productupload' + guard.run_key('a')


def own_tag():
    return images.REGISTRY + '/hidi-web:product-upload-' + run_key()


def image_id(image):
    return json.loads(images.docker('image', 'inspect', image))[0]['Id']


def source_guard():
    actual = subprocess.check_output(['git', 'rev-parse', 'HEAD'], text=True).strip()
    assert actual == os.environ['GITHUB_SHA'] and re.fullmatch(r'[a-f0-9]{40}', actual), 'Exact checked-out source required'
    protected = ['apps', 'package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml',
                 'deploy/admin-tools/handler.mjs', 'deploy/admin-tools/navigation.js']
    changed = subprocess.check_output(['git', 'diff', '--name-only', BASELINE, 'HEAD', '--', *protected], text=True).splitlines()
    assert not changed, 'Uploader must not rebuild or change existing application/dependency/Admin sources'
    dirty = subprocess.check_output(['git', 'diff', '--name-only', 'HEAD', '--', *protected, 'deploy/product-upload', 'tests/product-upload.browser.mjs'], text=True).splitlines()
    assert not dirty, 'Reviewed uploader source must be committed and clean'
    assert set(patcher.FILES) <= {path.name for path in HERE.iterdir() if path.is_file()}, 'Complete uploader source required'
    return actual


def backup(before):
    for name, state in before.items():
        tag_name = 'backup-product-upload-' + run_key()
        tag = images.REGISTRY + '/' + name + ':' + tag_name
        for args in [('pull', state['image']), ('tag', state['image'], tag), ('push', tag)]:
            subprocess.run(['docker', *args], check=True)
        value = subprocess.check_output(['az', 'acr', 'repository', 'show', '--name', 'acrhidiprod0927',
            '--image', name + ':' + tag_name, '--query', 'digest', '-o', 'tsv', '--only-show-errors'], text=True).strip()
        assert value == state['image'].split('@', 1)[1], 'Backup digest mismatch'
        save(name.removeprefix('hidi-') + '-backup.json', {'verified': True, 'originalImage': state['image'],
            'backupTag': tag, 'digest': value, 'settingsHash': state['settingsHash']})
        photo.unchanged(before)


def require_backups(before):
    for name, state in before.items():
        report = read(name.removeprefix('hidi-') + '-backup.json')
        assert report.get('verified') is True and report.get('originalImage') == state['image'], 'Fresh exact backup required'
        assert report.get('settingsHash') == state['settingsHash'], 'Backup settings baseline differs'
        tag_name = name + ':backup-product-upload-' + run_key()
        value = subprocess.check_output(['az', 'acr', 'repository', 'show', '--name', 'acrhidiprod0927',
            '--image', tag_name, '--query', 'digest', '-o', 'tsv', '--only-show-errors'], text=True).strip()
        assert value == report.get('digest') == state['image'].split('@', 1)[1], 'Registry backup digest changed'


def capture():
    setup()
    source_guard()
    photo.capture()
    before = photo.states()
    assert not re.fullmatch(r'hidi-web--productupload\d+a\d+', before['hidi-web']['latest']), 'Refusing to recapture an owned pending uploader as a new baseline'
    for name, state in before.items():
        guard.immutable(state['image'], name.removeprefix('hidi-'))
    backup(before)
    public = guard.public_snapshot()
    guard.write_private('public-before.json', public)
    images.extract(before['hidi-api']['image'], PRIVATE / 'api/base-app')
    photo.unchanged(before)
    assert guard.public_snapshot() == public, 'Public CMS content changed during capture'
    save('capture.json', {'passed': True, 'sourceSha': os.environ['GITHUB_SHA'], 'bothBackupsVerified': True,
        'apiUnchanged': True, 'databaseWrites': False, 'blobWrites': False})
    print('PASS: fresh ready images, unchanged public configuration and both immutable rollback backups verified')


METADATA_SCRIPT = """const fs=require('node:fs'),path=require('node:path');const root='/app',out={};
function walk(dir){for(const name of fs.readdirSync(dir)){const p=path.join(dir,name),s=fs.lstatSync(p);out[path.relative(root,p)]={mode:s.mode&4095,uid:s.uid,gid:s.gid,kind:s.isSymbolicLink()?'link':s.isDirectory()?'directory':s.isFile()?'file':'other'};if(s.isDirectory())walk(p);}}
walk(root);process.stdout.write(JSON.stringify(out));"""


def metadata(image):
    value = subprocess.check_output(['docker', 'run', '--rm', '--network', 'none', '--read-only',
        '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges=true', '--entrypoint', 'node',
        image, '-e', METADATA_SCRIPT], text=True, timeout=180)
    result = json.loads(value)
    assert isinstance(result, dict) and len(result) > 100, 'Complete image permission inventory required'
    return result


def verify_permissions(before, after, allowed):
    assert isinstance(before, dict) and isinstance(after, dict) and before, 'Image permission inventories required'
    for name, value in before.items():
        assert after.get(name) == value, 'Retained permissions, ownership or file type changed: ' + name
    added = set(after) - set(before)
    new_files = {name for name in allowed if name not in before}
    allowed_directories = {str(Path(name).parent).replace('\\', '/') for name in new_files}
    assert added <= new_files | allowed_directories, 'Unreviewed image path added'
    owner = before.get(patcher.HANDLER)
    assert owner and owner.get('kind') == 'file', 'Retained Admin owner inventory required'
    for name in new_files:
        assert after.get(name, {}).get('kind') == 'file' and after[name]['mode'] == 0o644, 'New regular readable uploader asset required'
        assert (after[name]['uid'], after[name]['gid']) == (owner['uid'], owner['gid']), 'New uploader ownership differs from retained Admin'
    for name in added - new_files:
        assert after[name]['kind'] == 'directory' and after[name]['mode'] == 0o755, 'New uploader directory permissions differ'
        assert (after[name]['uid'], after[name]['gid']) == (owner['uid'], owner['gid']), 'New uploader directory ownership differs'
    return {'passed': True, 'retainedPathPermissionsPreserved': len(before), 'newPaths': sorted(added)}


def compose():
    setup()
    source_guard()
    before = photo.states()
    require_backups(before)
    photo.unchanged(before)
    folder = PRIVATE / 'web'
    folder.mkdir()
    base, overlay, candidate = (folder / name for name in ['base-app', 'overlay', 'candidate-app'])
    images.extract(before['hidi-web']['image'], base)
    plan = patcher.patch_runtime(base, overlay)
    save('patch.json', plan)
    for name in plan['allowedFiles']:
        if name.endswith(('.js', '.mjs')):
            subprocess.run(['node', '--check', str(overlay / name)], check=True)
    shutil.copyfile(HERE / 'Dockerfile', folder / 'Dockerfile')
    subprocess.run(['docker', 'build', '--pull=false', '--build-arg', 'BASE_IMAGE=' + before['hidi-web']['image'],
        '-t', own_tag(), str(folder)], check=True)
    images.extract(own_tag(), candidate)
    configs = json.loads(images.docker('image', 'inspect', before['hidi-web']['image'], own_tag()))
    report = guard.preserve.verify(base, candidate, overlay, set(plan['allowedFiles']), configs)
    assert set(report['changedFiles']) == set(plan['allowedFiles']), 'Uploader runtime delta must be exact'
    permission_report = verify_permissions(metadata(before['hidi-web']['image']), metadata(own_tag()), set(plan['allowedFiles']))
    save('permissions.json', permission_report)
    repaired_files = verify_upload_retry_report(plan)
    report.update({'baseImage': before['hidi-web']['image'], 'candidateImageId': configs[1]['Id'],
        'candidateTag': own_tag(), 'permissionsPreserved': True, 'compiledNextUnchanged': not repaired_files,
        'compiledNextPreservedExceptUploadRetry': True, 'uploadRetryFiles': sorted(repaired_files),
        'storefrontAndSeoUnchanged': True, 'apiUnchanged': True})
    save('web-preservation.json', report)
    photo.unchanged(before)
    print('PASS: only the Admin uploader and verified storage retry copies changed; unrelated files, permissions and image settings preserved')


def verify_upload_retry_report(plan):
    repair = plan.get('uploadRetryRepair')
    assert isinstance(repair, dict) and all(repair.get(key) is True for key in ['passed',
        'inverseTransformsVerified', 'legacyUploadsPreserved', 'apiUnchanged']), 'Verified upload retry repair required'
    assert repair.get('moduleId') == 80441, 'Reviewed upload helper module differs'
    expected_old = 'c8a90498b6228a163576fa02da7b069c98a1afb2b4bd63298ebb45d9d5772f48'
    assert hashlib.sha256(patcher.OLD_UPLOAD_HELPER.encode()).hexdigest() == expected_old
    assert repair.get('oldFunctionSha256') == expected_old, 'Original loaded helper must match the reviewed evidence'
    assert repair.get('newFunctionSha256') == hashlib.sha256(patcher.NEW_UPLOAD_HELPER.encode()).hexdigest(), 'Retry helper replacement differs'
    files, names = repair.get('files'), repair.get('changedFiles')
    assert isinstance(files, list) and isinstance(names, list) and len(names) == len(set(names)), 'Unique retry repair files required'
    assert names == sorted(names) and sorted(row.get('path', '') for row in files) == names, 'Complete retry file proof required'
    base, candidate = PRIVATE / 'web/base-app', PRIVATE / 'web/candidate-app'
    server = base / 'apps/web/.next/server'
    assert server.is_dir() and not server.is_symlink(), 'Captured server module tree required'
    discovered = set()
    for module in server.rglob('*.js'):
        assert not module.is_symlink(), 'Symlinked server modules are outside the repair scope'
        if patcher.OLD_UPLOAD_FACTORY.encode() in module.read_bytes():
            discovered.add(module.relative_to(base).as_posix())
    assert discovered == set(names), 'Every exact original helper copy must be repaired; extra paths are forbidden'
    total = 0
    for row in files:
        relative = Path(row['path'])
        assert not relative.is_absolute() and '..' not in relative.parts and relative.parts[:4] == ('apps', 'web', '.next', 'server') and relative.suffix == '.js', 'Retry repair must target a reviewed server JS module'
        before, after = base / relative, candidate / relative
        assert before.is_file() and after.is_file() and not before.is_symlink() and not after.is_symlink(), 'Regular captured retry modules required'
        original, saved = before.read_bytes(), after.read_bytes()
        old_factory, new_factory = patcher.OLD_UPLOAD_FACTORY.encode(), patcher.NEW_UPLOAD_FACTORY.encode()
        count = original.count(old_factory)
        assert count == row.get('copies') == 1 and saved.count(new_factory) == 1, 'Exactly one bound helper factory per reviewed file required'
        assert saved.replace(new_factory, old_factory) == original, 'Retry repair changed unrelated server bytes'
        assert row.get('beforeSha256') == sha256(before) and row.get('afterSha256') == sha256(after), 'Retry proof must match actual captured file bytes'
        assert row.get('inverseTransformsVerified') is True, 'Inverse retry proof required'
        total += count
    assert repair.get('copiesPatched') == total and isinstance(repair.get('copiesScanned'), int) and repair['copiesScanned'] >= max(total, 1), 'Complete registered helper inventory required'
    assert plan.get('compiledNextUntouched') is (not names), 'Compiled change claim differs from the verified repair'
    assert plan.get('compiledNextPreservedExceptUploadRetry') is True, 'All other compiled server bytes must be preserved'
    return set(names)


def verify_uploader_report(report, live=False):
    assert report.get('passed') is True and report.get('liveWrites') == 0, 'Complete zero-production-write uploader regression required'
    assert report.get('productionDatabaseWrites') == report.get('productionBlobWrites') == 0, 'Production product and photo writes are forbidden during regression'
    assert report.get('authVerified') is True, 'Uploader auth boundaries must be verified'
    if live:
        assert report.get('bytesVerified') is True and report.get('customerRoutesRetained') is True, 'Live asset and retained route verification required'
        return
    assert report.get('actualRetainedRuntime') is True and report.get('templateRoundTrip') is True, 'Actual candidate and real XLSX template round trip required'
    rows = report.get('results')
    assert isinstance(rows, list) and len(rows) == 12, 'All twelve browser and viewport cases required'
    expected = {(engine, width, height) for engine in ENGINES for width, height in VIEWPORTS}
    assert {(row.get('engine'), row.get('width'), row.get('height')) for row in rows} == expected, 'Browser viewport matrix differs'
    for row in rows:
        assert all(row.get(key) is True for key in ['passed', 'fixtureDraftSaved', 'fixtureImagesUploaded',
            'fixturePublished', 'retainedAdminVerified']), 'A draft, image, publication or retained Admin check is incomplete'
        assert row.get('inventoryWrites') == row.get('liveWrites') == 0, 'Stock and production writes must remain absent'
        assert isinstance(row.get('fixtureWrites'), int) and row['fixtureWrites'] > 0, 'Fixture product/status writes must be exercised'
        assert isinstance(row.get('fixturePhotoWrites'), int) and row['fixturePhotoWrites'] > 0, 'Fixture binary photo uploads must be exercised'


def reports_ready():
    plan = read('patch.json')
    preserved = read('web-preservation.json')
    retry_files = verify_upload_retry_report(plan)
    expected = {patcher.HANDLER, patcher.NAVIGATION} | {'admin-tools/product-upload/' + name for name in patcher.FILES} | retry_files
    assert plan.get('passed') is True and set(plan.get('allowedFiles', [])) == expected, 'Exact additive uploader file scope required'
    assert plan.get('newPage') == patcher.PAGE and all(plan.get(key) is True for key in [
        'inverseTransformsVerified', 'compiledNextPreservedExceptUploadRetry', 'serverUntouched', 'apiUnchanged', 'retainedPagePoliciesPreserved'])
    assert preserved.get('passed') is True and set(preserved.get('changedFiles', [])) == expected, 'Runtime preservation delta differs'
    assert all(preserved.get(key) is True for key in ['runtimeConfigurationPreserved', 'baseLayersPreserved',
        'permissionsPreserved', 'compiledNextPreservedExceptUploadRetry', 'storefrontAndSeoUnchanged', 'apiUnchanged'])
    assert preserved.get('compiledNextUnchanged') is (not retry_files) and preserved.get('uploadRetryFiles') == sorted(retry_files), 'Compiled preservation evidence differs from the exact repair'
    assert read('permissions.json').get('passed') is True
    uploader = read('candidate/report.json')
    verify_uploader_report(uploader)
    assert uploader.get('templateSha256') == sha256(HERE / 'HIDI_Product_Upload_Template.xlsx'), 'Browser workbook must be the reviewed downloadable template'
    admin = read('admin-runtime.json')
    assert admin.get('passed') is True and admin.get('customerRoutesRetained') is True and admin.get('anonymousAdminDataDenied') is True
    verify_api_image_report(read('api-images.json'))
    verify_api_product_report(read('api-products.json'))
    upload_hash = read('next-hash.json')
    assert all(upload_hash.get(key) is True for key in ['passed', 'actualNextHttp', 'contentHashVerified',
        'mainAltVerified', 'duplicateRetryVerified', 'coverByFirstUploadVerified', 'photoLimitVerified',
        'requestBodyLimitVerified', 'loadedStorageHelperVerified']), 'Actual retained Next cover, limits, content-hash and loaded retry regression required'
    loaded = upload_hash.get('loadedModuleDiagnostic', {})
    assert loaded.get('webpackRequireAvailable') is True and loaded.get('helperModuleId') == '80441', 'Actual loaded helper identity required'
    helper = loaded.get('loadedHelper', {})
    assert helper.get('guardInstalled') is True and loaded.get('currentFactory', {}).get('guardInstalled') is True, 'Both cached helper and registered factory must carry the repair'
    source = helper.get('source')
    assert isinstance(source, str) and source and helper.get('sha256') == hashlib.sha256(source.encode()).hexdigest(), 'Loaded helper source/hash proof required'
    sources = [PRIVATE / 'web/candidate-app' / name for name in retry_files]
    sources.append(PRIVATE / 'web/candidate-app/apps/web/.next/server/app/api/admin/inventory/[variantId]/images/route.js')
    assert any(file.is_file() and source in file.read_text() for file in sources), 'Loaded helper must match verified candidate bytes'
    error = loaded.get('bundledSdkError', {})
    assert error.get('statusCode') == error.get('responseStatus') == 409 and error.get('code') == 'BlobAlreadyExists', 'Actual bundled SDK conflict semantics required'
    assert upload_hash.get('photoLimitBytes') == 12 * 1024 * 1024 and upload_hash.get('requestBodyBytes') == 14 * 1024 * 1024, 'Retained photo limits differ'
    assert upload_hash.get('productionDatabaseWrites') == upload_hash.get('productionBlobWrites') == 0
    hash_checks = upload_hash.get('checks')
    assert isinstance(hash_checks, list) and hash_checks and all(
        row.get('passed') is True or row.get('status') == 'PASS' for row in hash_checks), 'Complete retained Next hash checks required'
    deletion = read('admin-deletion.json').get('results', [])
    assert len(deletion) >= 30 and {(row.get('engine'), row.get('mode')) for row in deletion} == {(engine, mode) for engine in ENGINES for mode in ['mobile', 'desktop']}
    assert all(row.get('status') == 'PASS' for row in deletion), 'Retained deletion regression incomplete'
    commerce = read('retained-commerce.json')
    assert commerce.get('passed') is True and commerce.get('liveWrites') == 0 and commerce.get('footerLinksAccessible') is True
    assert set(commerce.get('engines', [])) == ENGINES and len(commerce.get('results', [])) == 12
    assert all(row.get('passed') is True for row in commerce['results']), 'Retained customer or SEO regression incomplete'
    verify_retained_provenance(read('retained-commerce-provenance.json'))


def verify_api_image_report(report):
    assert all(report.get(key) is True for key in ['passed', 'actualCompiledApi', 'coverByFirstUploadVerified',
        'allSizesVerified', 'altUpdateVerified', 'duplicateMetadataAvoided', 'existingCoverPreserved']), 'Actual captured API image behavior must be verified'
    assert report.get('inventoryWrites') == report.get('productionDatabaseWrites') == report.get('productionBlobWrites') == 0, 'API regression must use only disposable image fixtures'
    checks = report.get('checks')
    assert isinstance(checks, list) and checks and all(row.get('passed') is True or row.get('status') == 'PASS' for row in checks), 'Complete actual API image checks required'
    verify_captured_api_module(report.get('moduleRelativePath', ''), report.get('moduleSha256'))


def verify_captured_api_module(relative_path, digest):
    relative = Path(relative_path)
    assert not relative.is_absolute() and '..' not in relative.parts and relative.parts[:3] == ('apps', 'api', 'dist'), 'Captured API module scope differs'
    module = PRIVATE / 'api/base-app' / relative
    assert module.is_file() and digest == sha256(module), 'API report must match the actual captured compiled service'


def verify_api_product_report(report):
    assert all(report.get(key) is True for key in ['passed', 'actualCompiledApi', 'coreCreateVerified',
        'metadataVerified', 'variantsVerified', 'statusVerified', 'versionGuardVerified', 'zeroStockVerified',
        'completeReturnVerified']), 'Actual captured API product contracts must be verified'
    assert report.get('inventoryWrites') == report.get('productionDatabaseWrites') == report.get('productionBlobWrites') == 0, 'Product API regression must use only disposable fixtures'
    checks = report.get('checks')
    assert isinstance(checks, list) and checks and all(row.get('passed') is True or row.get('status') == 'PASS' for row in checks), 'Complete actual API product checks required'
    modules = report.get('modules')
    assert isinstance(modules, list) and len(modules) == 2, 'Both captured product parser and service must be bound'
    assert {Path(row.get('moduleRelativePath', '')).name for row in modules} == {'product-input.js', 'admin-products.service.js'}, 'Captured product module scope differs'
    for module in modules:
        verify_captured_api_module(module.get('moduleRelativePath', ''), module.get('moduleSha256'))


def retained_source_hashes():
    return {name: hashlib.sha256(subprocess.check_output(['git', 'show', BASELINE + ':' + name])).hexdigest()
        for name in RETAINED_SOURCES}


def verify_retained_provenance(provenance):
    assert provenance.get('passed') is True and provenance.get('liveWrites') == 0, 'Pinned retained customer suite proof required'
    assert provenance.get('baselineSourceSha') == BASELINE, 'Retained regression baseline differs'
    assert provenance.get('executionSourceSha') == os.environ['GITHUB_SHA'], 'Retained regression execution source differs'
    assert provenance.get('sourceHashes') == retained_source_hashes(), 'Pinned retained launcher or probes differ'
    assert provenance.get('helperSha256') == sha256(HERE / 'retained-commerce.mjs'), 'Retained suite helper differs'
    assert provenance.get('reportSha256') == sha256(EVIDENCE / 'retained-commerce.json'), 'Retained suite report differs'


def report_manifest():
    paths = {**REPORT_PATHS, 'permissions': 'permissions.json'}
    return {key: sha256(EVIDENCE / name) for key, name in paths.items()}


def seal():
    setup()
    source_guard()
    photo.unchanged(photo.states())
    reports_ready()
    preserved = read('web-preservation.json')
    assert preserved['candidateTag'] == own_tag() and preserved['candidateImageId'] == image_id(own_tag()), 'Candidate image changed after verification'
    save('candidate-regression.json', {'passed': True, 'candidateImageId': preserved['candidateImageId'],
        'sourceSha': os.environ['GITHUB_SHA'], 'reportManifest': report_manifest(), 'databaseWrites': False, 'blobWrites': False})


def publish():
    seal()
    tested = read('candidate-regression.json')
    subprocess.run(['docker', 'push', own_tag()], check=True)
    value = subprocess.check_output(['az', 'acr', 'repository', 'show', '--name', 'acrhidiprod0927',
        '--image', 'hidi-web:product-upload-' + run_key(), '--query', 'digest', '-o', 'tsv', '--only-show-errors'], text=True).strip()
    image = images.REGISTRY + '/hidi-web@' + value
    guard.immutable(image, 'web')
    subprocess.run(['docker', 'pull', image], check=True)
    assert image_id(image) == tested['candidateImageId'], 'Published immutable image differs from tested candidate'
    save('published.json', {'verified': True, 'image': image, **tested})
    with open(os.environ['GITHUB_ENV'], 'a') as stream:
        stream.write('WEB_IMAGE=' + image + '\n')


def require_candidate(image):
    guard.immutable(image, 'web')
    source_guard()
    reports_ready()
    preserved, tested, published = (read(name) for name in ['web-preservation.json', 'candidate-regression.json', 'published.json'])
    assert tested.get('passed') is True and published.get('verified') is True and published.get('image') == image
    assert preserved.get('passed') is True and preserved['baseImage'] == photo.states()['hidi-web']['image']
    assert preserved['candidateImageId'] == tested['candidateImageId'] == published['candidateImageId'] == image_id(image), 'Image identity differs from tested candidate'
    assert tested['sourceSha'] == published['sourceSha'] == os.environ['GITHUB_SHA'], 'Candidate source differs'
    assert tested['reportManifest'] == published['reportManifest'] == report_manifest(), 'Candidate evidence changed after testing'


def live_assets():
    candidate = PRIVATE / 'web/candidate-app'
    for name in patcher.ASSETS:
        expected = (candidate / 'admin-tools/product-upload' / name).read_bytes()
        assert cloud.get(patcher.ASSET_PREFIX + name) == expected, 'Live uploader asset differs: ' + name
    assert cloud.get(patcher.PAGE) == (candidate / 'admin-tools/product-upload/page.html').read_bytes(), 'Live uploader page differs'
    for name in ['navigation.js', 'handler.mjs']:
        if name == 'navigation.js':
            assert cloud.get('/admin-tools-assets/' + name) == (candidate / 'admin-tools' / name).read_bytes(), 'Live navigation differs'
    for path in ['/api/admin/session', '/api/admin/products/options', '/api/admin/products?status=DRAFT',
        '/api/hidi/product-image-skus', '/api/hidi/product-deletion/fixture-upload-no-product']:
        cloud.get(path, 401)
    guard.routes()
    subprocess.run(['node', 'tests/product-upload.browser.mjs', '--live', cloud.BASE,
        str(EVIDENCE / 'live/report.json')], check=True, timeout=900)
    verify_uploader_report(read('live/report.json'), live=True)


def apply(image):
    setup()
    before = photo.states()
    require_backups(before)
    require_candidate(image)
    photo.unchanged(before)
    captured = guard.private_json('public-before.json')
    assert guard.public_snapshot() == captured, 'Published media, policy or public configuration changed after capture'
    guard.write_private('forward-write.json', {'attempted': False, 'mayComplete': False})
    guard.install_interrupt_handler()
    try:
        photo.unchanged(before)
        guard.conditional_write_image(photo.originals()['hidi-web'], image, suffix(), 'forward-write.json')
        state = cloud.snapshot(guard.wait_ready(image, suffix(), before))
        assert state['settingsHash'] == before['hidi-web']['settingsHash'], 'Web settings changed'
        live_assets()
        assert guard.public_snapshot() == captured, 'Published CMS content changed during release'
        photo.unchanged({'hidi-api': before['hidi-api'], 'hidi-web': state})
        save('after.json', {'passed': True, 'states': {'hidi-api': before['hidi-api'], 'hidi-web': state},
            'sourceSha': os.environ['GITHUB_SHA'], 'apiUnchanged': True, 'webSettingsPreserved': True,
            'publicContentPreserved': True, 'compiledNextUnchanged': read('web-preservation.json')['compiledNextUnchanged'],
            'compiledNextPreservedExceptUploadRetry': True, 'storefrontAndSeoUnchanged': True,
            'existingAdminFunctionsPreserved': True, 'databaseWrites': False, 'blobWrites': False})
        print('PASS: Product Upload is live; existing Admin, storefront, SEO, API, settings and product/media data preserved')
    except Exception:
        try:
            marker = guard.private_json('forward-write.json')
            recovery = guard.reconcile_failure(image, before, captured, captured, suffix(),
                bool(marker.get('attempted') and marker.get('mayComplete')))
        except Exception as error:
            recovery = {'passed': False, 'webStatus': 'restore-failed', 'errorType': type(error).__name__}
        recovery.update({'apiWrites': False, 'databaseWrites': False, 'blobWrites': False})
        save('rollback.json', recovery)
        raise


def recover(image):
    setup()
    guard.immutable(image, 'web')
    before = photo.states()
    captured = guard.private_json('public-before.json')
    result = guard.reconcile_failure(image, before, captured, captured, suffix(), forward_may_complete=True)
    result.update({'externalRecovery': True, 'apiWrites': False, 'databaseWrites': False, 'blobWrites': False})
    save('external-recovery.json', result)
    assert result.get('passed') is True and result.get('webStatus') != 'restore-failed', 'Owned uploader recovery did not finish'


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('mode', choices=['capture', 'compose', 'seal', 'publish', 'apply', 'recover'])
    parser.add_argument('--image')
    args = parser.parse_args()
    try:
        if args.mode in ['apply', 'recover']:
            globals()[args.mode](args.image)
        else:
            globals()[args.mode]()
    except Exception as error:
        print(str(error) if isinstance(error, (AssertionError, cloud.AzureOperationError)) else
            'Uploader release stopped; inspect bounded verification evidence', file=sys.stderr)
        raise SystemExit(1)
