"""Failure boundaries for the additive uploader and its Web-only release."""
import copy
import importlib.util
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest
from unittest.mock import patch
import zipfile

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('product_upload_release_test', ROOT / 'deploy/product-upload/release.py')
release = importlib.util.module_from_spec(spec)
spec.loader.exec_module(release)
patcher = release.patcher


def image(app, marker):
    return release.images.REGISTRY + '/hidi-' + app + '@sha256:' + marker * 64


def states():
    return {name: {'image': image(name.removeprefix('hidi-'), 'a'), 'settingsHash': 'original-' + name,
        'latest': name + '--original', 'ready': name + '--original', 'mode': 'Single'} for name in ['hidi-web', 'hidi-api']}


def uploader_report():
    return {'passed': True, 'liveWrites': 0, 'actualRetainedRuntime': True, 'templateRoundTrip': True, 'authVerified': True,
        'productionDatabaseWrites': 0, 'productionBlobWrites': 0,
        'templateSha256': release.sha256(ROOT / 'deploy/product-upload/HIDI_Product_Upload_Template.xlsx'),
        'results': [{'engine': engine, 'width': width, 'height': height, 'passed': True, 'fixtureDraftSaved': True,
            'fixtureImagesUploaded': True, 'fixturePublished': True, 'retainedAdminVerified': True, 'packageUploadVerified': True,
            'inventoryWrites': 0, 'liveWrites': 0, 'fixtureWrites': 5, 'fixturePhotoWrites': 2}
            for engine in sorted(release.ENGINES) for width, height in sorted(release.VIEWPORTS)]}


def seed_retry_module(base):
    relative = 'apps/web/.next/server/chunks/fixture-upload.js'
    file = Path(base) / relative
    file.parent.mkdir(parents=True, exist_ok=True)
    file.write_text('exports.modules={' + patcher.OLD_UPLOAD_FACTORY + '};\n')
    return relative


def valid_evidence(folder):
    api_module = release.PRIVATE / 'api/base-app/apps/api/dist/admin/admin.service.js'
    api_module.parent.mkdir(parents=True, exist_ok=True)
    api_module.write_text('module.exports = { fixtureOnly: true };\n')
    product_modules = []
    for name in ['product-input.js', 'admin-products.service.js']:
        relative = 'apps/api/dist/admin/products/' + name
        module = release.PRIVATE / 'api/base-app' / relative
        module.parent.mkdir(parents=True, exist_ok=True)
        module.write_text('module.exports = { fixtureOnly: true };\n')
        product_modules.append({'moduleRelativePath': relative, 'moduleSha256': release.sha256(module)})
    base, candidate = release.PRIVATE / 'web/base-app', release.PRIVATE / 'web/candidate-app'
    retry_path = seed_retry_module(base)
    changed = candidate / retry_path
    changed.parent.mkdir(parents=True, exist_ok=True)
    changed.write_text((base / retry_path).read_text().replace(patcher.OLD_UPLOAD_FACTORY, patcher.NEW_UPLOAD_FACTORY))
    repair = {'passed': True, 'moduleId': 80441, 'oldFunctionSha256': patcher.digest(patcher.OLD_UPLOAD_HELPER),
        'newFunctionSha256': patcher.digest(patcher.NEW_UPLOAD_HELPER), 'copiesScanned': 1, 'copiesPatched': 1,
        'inverseTransformsVerified': True, 'legacyUploadsPreserved': True, 'apiUnchanged': True,
        'changedFiles': [retry_path], 'files': [{'path': retry_path, 'copies': 1,
            'beforeSha256': release.sha256(base / retry_path), 'afterSha256': release.sha256(changed),
            'inverseTransformsVerified': True}]}
    expected = sorted({patcher.HANDLER, patcher.NAVIGATION} | {'admin-tools/product-upload/' + name for name in patcher.FILES} | {retry_path})
    plan = {'passed': True, 'allowedFiles': expected, 'newPage': patcher.PAGE,
        'compiledNextUntouched': False, 'uploadRetryRepair': repair}
    for key in ['inverseTransformsVerified', 'compiledNextPreservedExceptUploadRetry', 'serverUntouched', 'apiUnchanged', 'retainedPagePoliciesPreserved']:
        plan[key] = True
    preserved = {'passed': True, 'changedFiles': expected, 'candidateImageId': 'fixture-image-id',
        'candidateTag': release.own_tag(), 'baseImage': image('web', 'a'),
        'compiledNextUnchanged': False, 'uploadRetryFiles': [retry_path]}
    for key in ['runtimeConfigurationPreserved', 'baseLayersPreserved', 'permissionsPreserved', 'compiledNextPreservedExceptUploadRetry', 'storefrontAndSeoUnchanged', 'apiUnchanged']:
        preserved[key] = True
    reports = {
        'patch.json': plan,
        'web-preservation.json': preserved,
        'permissions.json': {'passed': True},
        'candidate/report.json': uploader_report(),
        'admin-runtime.json': {'passed': True, 'customerRoutesRetained': True, 'anonymousAdminDataDenied': True},
        'api-images.json': {'passed': True, 'actualCompiledApi': True, 'coverByFirstUploadVerified': True,
            'allSizesVerified': True, 'altUpdateVerified': True, 'duplicateMetadataAvoided': True, 'existingCoverPreserved': True,
            'inventoryWrites': 0, 'productionDatabaseWrites': 0, 'productionBlobWrites': 0,
            'moduleRelativePath': 'apps/api/dist/admin/admin.service.js', 'moduleSha256': release.sha256(api_module),
            'checks': [{'name': 'Actual captured API image append and upsert', 'status': 'PASS'}]},
        'api-products.json': {'passed': True, 'actualCompiledApi': True, 'coreCreateVerified': True,
            'metadataVerified': True, 'variantsVerified': True, 'statusVerified': True, 'versionGuardVerified': True,
            'zeroStockVerified': True, 'completeReturnVerified': True, 'inventoryWrites': 0,
            'productionDatabaseWrites': 0, 'productionBlobWrites': 0, 'modules': product_modules,
            'checks': [{'name': 'Actual captured API product contracts', 'status': 'PASS'}]},
        'next-hash.json': {'passed': True, 'actualNextHttp': True, 'contentHashVerified': True, 'mainAltVerified': True,
            'duplicateRetryVerified': True, 'coverByFirstUploadVerified': True, 'photoLimitVerified': True,
            'requestBodyLimitVerified': True, 'loadedStorageHelperVerified': True,
            'loadedModuleDiagnostic': {'webpackRequireAvailable': True, 'helperModuleId': '80441',
                'loadedHelper': {'guardInstalled': True, 'source': patcher.NEW_UPLOAD_HELPER,
                    'sha256': patcher.digest(patcher.NEW_UPLOAD_HELPER)}, 'currentFactory': {'guardInstalled': True},
                'bundledSdkError': {'statusCode': 409, 'responseStatus': 409, 'code': 'BlobAlreadyExists'}},
            'photoLimitBytes': 12 * 1024 * 1024, 'requestBodyBytes': 14 * 1024 * 1024,
            'productionDatabaseWrites': 0, 'productionBlobWrites': 0,
            'checks': [{'name': 'Actual Next hash and fixture Blob retry', 'status': 'PASS'}]},
        'admin-deletion.json': {'results': [{'engine': engine, 'mode': mode, 'status': 'PASS'}
            for engine in sorted(release.ENGINES) for mode in ['mobile', 'desktop'] for _ in range(5)]},
        'retained-commerce.json': {'passed': True, 'liveWrites': 0, 'footerLinksAccessible': True,
            'engines': sorted(release.ENGINES), 'results': [{'passed': True} for _ in range(12)]},
    }
    for name, value in reports.items():
        path = folder / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(value))
    provenance = {'passed': True, 'liveWrites': 0, 'baselineSourceSha': release.BASELINE,
        'executionSourceSha': os.environ['GITHUB_SHA'], 'sourceHashes': release.retained_source_hashes(),
        'helperSha256': release.sha256(ROOT / 'deploy/product-upload/retained-commerce.mjs'),
        'reportSha256': release.sha256(folder / 'retained-commerce.json')}
    reports['retained-commerce-provenance.json'] = provenance
    (folder / 'retained-commerce-provenance.json').write_text(json.dumps(provenance))
    return reports


class UploaderGuards(unittest.TestCase):
    def setUp(self):
        self.env = patch.dict(os.environ, {'GITHUB_RUN_ID': '123', 'GITHUB_RUN_ATTEMPT': '2', 'GITHUB_SHA': 'b' * 40})
        self.env.start()
        self.addCleanup(self.env.stop)
        self.private_fixture = tempfile.TemporaryDirectory()
        self.addCleanup(self.private_fixture.cleanup)
        self.private_patch = patch.object(release, 'PRIVATE', Path(self.private_fixture.name))
        self.private_patch.start()
        self.addCleanup(self.private_patch.stop)

    def test_additive_handler_and_navigation_restore_exactly(self):
        handler = (ROOT / 'deploy/admin-tools/handler.mjs').read_text()
        navigation = (ROOT / 'deploy/admin-tools/navigation.js').read_text()
        new_handler, edits = patcher.insert_handler(handler)
        self.assertEqual(patcher.inverse(new_handler, edits), handler)
        new_navigation, edit = patcher.insert_navigation(navigation)
        self.assertEqual(patcher.inverse(new_navigation, [edit]), navigation)
        self.assertEqual(new_navigation.count("key: 'product-upload'"), 1)
        self.assertIn("pathname==='/admin/product-upload'?", new_handler)
        self.assertIn("img-src 'self' https: http: blob:;", new_handler)
        self.assertIn("img-src 'self' https: http:;", new_handler)
        self.assertIn(patcher.XLSX_TYPE, new_handler)
        self.assertIn('Content-Disposition', new_handler)
        self.assertIn("['GET','HEAD']", new_handler)
        with tempfile.TemporaryDirectory() as temp:
            file = Path(temp) / 'handler.mjs'
            file.write_text(new_handler)
            subprocess.run(['node', '--check', str(file)], check=True, capture_output=True)

    def test_package_update_preserves_existing_navigation_api_and_unrelated_assets(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            base, prior_source, prior_overlay = root / 'base', root / 'prior-source', root / 'prior-overlay'
            shutil.copytree(ROOT / 'deploy/admin-tools', base / 'admin-tools')
            (base / 'apps/web').mkdir(parents=True)
            (base / 'apps/web/server.js').write_text('retained Next')
            seed_retry_module(base)
            (base / 'server.mjs').write_text("import {handleQuickTools} from './admin-tools/handler.mjs';\nif (await handleQuickTools(request, response, pathname)) return;\n")
            prior_source.mkdir()
            for name in [*patcher.PRIOR_ASSET_HASHES, 'patch-runtime.py']:
                (prior_source / name).write_bytes(subprocess.check_output(['git', 'show', '47e97ebb:deploy/product-upload/' + name], cwd=ROOT))
            prior = release.load('prior_package_fixture_patcher', prior_source / 'patch-runtime.py')
            prior.patch_runtime(base, prior_overlay)
            shutil.copytree(prior_overlay, base, dirs_exist_ok=True)
            original_navigation = (base / patcher.NAVIGATION).read_bytes()
            original_handler = (base / patcher.HANDLER).read_text()
            overlay = root / 'package-overlay'
            report = patcher.patch_runtime(base, overlay)
            self.assertTrue(report['updatingExistingUploader'])
            self.assertEqual(report['allowedFiles'], sorted([patcher.HANDLER, *['admin-tools/product-upload/' + name for name in ['page.html', 'client.mjs', 'package.mjs', 'HIDI_Product_Upload_Package.zip']]]))
            self.assertEqual(report['uploadRetryRepair']['copiesPatched'], 0)
            self.assertFalse((overlay / patcher.NAVIGATION).exists())
            self.assertEqual((base / patcher.NAVIGATION).read_bytes(), original_navigation)
            subprocess.run(['node', '--check', str(overlay / patcher.HANDLER)], check=True, capture_output=True)
            self.assertIn('application/zip', (overlay / patcher.HANDLER).read_text())
            self.assertIn('HIDI_Product_Upload_Package.zip', (overlay / patcher.HANDLER).read_text())
            self.assertEqual(original_handler.count("['/admin/product-upload','product-upload/page.html']"), 1)
            self.assertTrue(report['compiledNextUntouched'])
            (base / 'admin-tools/product-upload/client.mjs').write_text('unexpected prior uploader change')
            with self.assertRaisesRegex(AssertionError, 'verified prior release'):
                patcher.patch_runtime(base, root / 'bad-update')

    def test_missing_ambiguous_or_already_patched_anchors_are_rejected(self):
        handler = (ROOT / 'deploy/admin-tools/handler.mjs').read_text()
        altered, _ = patcher.insert_handler(handler)
        for value in [altered, handler + handler, handler.replace('const assets=new Map([', 'const unrelated=new Map(['),
            handler.replace("img-src 'self' https: http:;", "img-src *;")]:
            with self.assertRaises(AssertionError):
                patcher.insert_handler(value)
        navigation = (ROOT / 'deploy/admin-tools/navigation.js').read_text()
        with self.assertRaises(AssertionError):
            patcher.insert_navigation(navigation.replace('  const tools = [\n', '  const unrelated = [\n'))

    def test_actual_handler_serves_xlsx_head_and_scoped_page_policy_without_write_routes(self):
        with tempfile.TemporaryDirectory() as temp:
            base = Path(temp) / 'app'
            shutil.copytree(ROOT / 'deploy/admin-tools', base / 'admin-tools')
            (base / 'apps/web').mkdir(parents=True)
            (base / 'apps/web/server.js').write_text('retained Next')
            seed_retry_module(base)
            (base / 'server.mjs').write_text("import {handleQuickTools} from './admin-tools/handler.mjs';\nif (await handleQuickTools(request, response, pathname)) return;\n")
            overlay = Path(temp) / 'overlay'
            patcher.patch_runtime(base, overlay)
            shutil.copytree(overlay, base, dirs_exist_ok=True)
            script = """import assert from 'node:assert/strict';
import {createServer} from 'node:http';import {readFile} from 'node:fs/promises';
import {handleQuickTools} from HANDLER;
const server=createServer(async(req,res)=>{if(!await handleQuickTools(req,res,new URL(req.url,'http://fixture').pathname,{hasStorefront:false,env:{}})){res.writeHead(404);res.end();}});
await new Promise(done=>server.listen(0,'127.0.0.1',done));const base='http://127.0.0.1:'+server.address().port;
try{
 const page=await fetch(base+'/admin/product-upload');assert.equal(page.status,200);assert.match(page.headers.get('content-security-policy'),/img-src[^;]*blob:/);assert.match(page.headers.get('x-robots-tag'),/noindex/);assert.match(page.headers.get('cache-control'),/no-store/);
 const retained=await fetch(base+'/admin/product-quick-fill');assert.equal(retained.status,200);assert(!/img-src[^;]*blob:/.test(retained.headers.get('content-security-policy')));
 const url=base+'/admin-tools-assets/product-upload/HIDI_Product_Upload_Template.xlsx',bytes=await readFile(WORKBOOK);
 const get=await fetch(url);assert.equal(get.status,200);assert.equal(get.headers.get('content-type'),'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');assert.match(get.headers.get('content-disposition'),/attachment; filename="HIDI_Product_Upload_Template.xlsx"/);assert(Buffer.from(await get.arrayBuffer()).equals(bytes));
 const head=await fetch(url,{method:'HEAD'});assert.equal(head.status,200);assert.equal(head.headers.get('content-length'),String(bytes.length));assert.equal((await head.arrayBuffer()).byteLength,0);
 for(const method of ['POST','PUT','DELETE']){const res=await fetch(url,{method});assert.equal(res.status,405);assert.equal(res.headers.get('allow'),'GET, HEAD');}
 assert.equal((await fetch(base+'/admin-tools-assets/product-upload/release.py')).status,404);
}finally{server.closeAllConnections();await new Promise(done=>server.close(done));}
"""
            script = script.replace('HANDLER', json.dumps((base / 'admin-tools/handler.mjs').as_uri())).replace(
                'WORKBOOK', json.dumps(str(base / 'admin-tools/product-upload/HIDI_Product_Upload_Template.xlsx')))
            result = subprocess.run(['node', '--input-type=module'], input=script, capture_output=True, text=True, timeout=15)
            self.assertEqual(result.returncode, 0, result.stderr)

    def test_patcher_requires_complete_real_workbook_and_connected_retained_runtime(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            base, overlay, source = root / 'base', root / 'overlay', root / 'source'
            (base / 'admin-tools').mkdir(parents=True)
            (base / 'apps/web').mkdir(parents=True)
            (base / 'apps/web/server.js').write_text('retained Next')
            seed_retry_module(base)
            (base / 'server.mjs').write_text("import {handleQuickTools} from './admin-tools/handler.mjs';\nif (await handleQuickTools(request, response, pathname)) return;\n")
            for name in ['handler.mjs', 'navigation.js']:
                shutil.copyfile(ROOT / 'deploy/admin-tools' / name, base / 'admin-tools' / name)
            source.mkdir()
            for name in patcher.FILES:
                (source / name).write_text('fixture asset')
            with patch.object(patcher, 'SOURCE', source):
                with self.assertRaises(zipfile.BadZipFile):
                    patcher.patch_runtime(base, overlay)
                with zipfile.ZipFile(source / 'HIDI_Product_Upload_Template.xlsx', 'w') as book:
                    book.writestr('[Content_Types].xml', 'fixture content types')
                    book.writestr('xl/workbook.xml', 'fixture workbook')
                result = patcher.patch_runtime(base, overlay)
                self.assertEqual(len(result['allowedFiles']), len(patcher.FILES) + 3)
                self.assertFalse((overlay / 'server.mjs').exists())
                self.assertFalse(result['compiledNextUntouched'])
                self.assertEqual(result['uploadRetryRepair']['copiesPatched'], 1)
                self.assertEqual((overlay / 'admin-tools/product-upload/HIDI_Product_Upload_Template.xlsx').read_bytes(),
                    (source / 'HIDI_Product_Upload_Template.xlsx').read_bytes())
                (base / 'server.mjs').write_text('unconnected admin server')
                with self.assertRaisesRegex(AssertionError, 'connected'):
                    patcher.patch_runtime(base, root / 'bad-overlay')

    def test_non_immutable_or_wrong_repository_images_are_rejected(self):
        release.guard.immutable(image('web', 'a'), 'web')
        for invalid in [image('api', 'a'), release.images.REGISTRY + '/hidi-web:mutable',
            'unrelated.example/hidi-web@sha256:' + 'a' * 64]:
            with self.assertRaises(AssertionError):
                release.guard.immutable(invalid, 'web')

    def test_all_protected_file_bytes_config_and_base_layers_must_match(self):
        with tempfile.TemporaryDirectory() as temp:
            roots = [Path(temp) / name for name in ['base', 'overlay', 'candidate']]
            base, overlay, candidate = roots
            for root in [base, candidate]:
                (root / 'admin-tools').mkdir(parents=True)
                (root / 'server.mjs').write_text('protected runtime and SEO')
                (root / 'admin-tools/handler.mjs').write_text('old' if root == base else 'new')
            (overlay / 'admin-tools').mkdir(parents=True)
            (overlay / 'admin-tools/handler.mjs').write_text('new')
            config = {'Config': {'Cmd': ['node', 'server.mjs'], 'User': 'node'}, 'RootFS': {'Layers': ['original']}}
            new = copy.deepcopy(config)
            new['RootFS']['Layers'].append('uploader')
            allowed = {'admin-tools/handler.mjs'}
            self.assertTrue(release.guard.preserve.verify(base, candidate, overlay, allowed, [config, new])['passed'])
            (candidate / 'server.mjs').write_text('unexpected SEO change')
            with self.assertRaisesRegex(AssertionError, 'Unreviewed'):
                release.guard.preserve.verify(base, candidate, overlay, allowed, [config, new])
            (candidate / 'server.mjs').write_text('protected runtime and SEO')
            changed = copy.deepcopy(new)
            changed['Config']['User'] = 'root'
            with self.assertRaisesRegex(AssertionError, 'configuration'):
                release.guard.preserve.verify(base, candidate, overlay, allowed, [config, changed])
            changed = copy.deepcopy(new)
            changed['RootFS']['Layers'][0] = 'different'
            with self.assertRaisesRegex(AssertionError, 'layers'):
                release.guard.preserve.verify(base, candidate, overlay, allowed, [config, changed])

    def test_permissions_owner_types_and_new_path_scope_are_protected(self):
        before = {'admin-tools': {'kind': 'directory', 'mode': 0o755, 'uid': 1000, 'gid': 1000},
            'admin-tools/handler.mjs': {'kind': 'file', 'mode': 0o644, 'uid': 1000, 'gid': 1000}}
        after = copy.deepcopy(before)
        after['admin-tools/product-upload'] = {'kind': 'directory', 'mode': 0o755, 'uid': 1000, 'gid': 1000}
        file = 'admin-tools/product-upload/client.mjs'
        after[file] = {'kind': 'file', 'mode': 0o644, 'uid': 1000, 'gid': 1000}
        self.assertTrue(release.verify_permissions(before, after, {'admin-tools/handler.mjs', file})['passed'])
        for field, value in [('mode', 0o777), ('uid', 0), ('gid', 0), ('kind', 'link')]:
            bad = copy.deepcopy(after)
            bad['admin-tools/handler.mjs'][field] = value
            with self.assertRaisesRegex(AssertionError, 'permissions'):
                release.verify_permissions(before, bad, {file})
        bad = copy.deepcopy(after)
        bad['unreviewed'] = after[file]
        with self.assertRaisesRegex(AssertionError, 'Unreviewed'):
            release.verify_permissions(before, bad, {file})

    def test_incomplete_browser_matrices_auth_actions_or_live_writes_fail(self):
        release.verify_uploader_report(uploader_report())
        for key, value in [('passed', False), ('liveWrites', 1), ('actualRetainedRuntime', False),
            ('templateRoundTrip', False), ('authVerified', False)]:
            report = uploader_report()
            report[key] = value
            with self.assertRaises(AssertionError):
                release.verify_uploader_report(report)
        for field in ['passed', 'fixtureDraftSaved', 'fixtureImagesUploaded', 'fixturePublished', 'retainedAdminVerified', 'packageUploadVerified']:
            report = uploader_report()
            report['results'][0][field] = False
            with self.assertRaises(AssertionError):
                release.verify_uploader_report(report)
        for change in ['missing', 'duplicate', 'wrong-height']:
            report = uploader_report()
            if change == 'missing':
                report['results'].pop()
            elif change == 'duplicate':
                report['results'][0] = report['results'][1]
            else:
                report['results'][0]['height'] = 999
            with self.assertRaises(AssertionError):
                release.verify_uploader_report(report)

    def test_live_probe_must_verify_auth_bytes_routes_and_no_production_writes(self):
        value = {'passed': True, 'liveWrites': 0, 'productionDatabaseWrites': 0, 'productionBlobWrites': 0,
            'authVerified': True, 'bytesVerified': True, 'customerRoutesRetained': True}
        release.verify_uploader_report(value, live=True)
        for key in value:
            bad = dict(value)
            bad[key] = 1 if key in ['liveWrites', 'productionDatabaseWrites', 'productionBlobWrites'] else False
            with self.assertRaises(AssertionError):
                release.verify_uploader_report(bad, live=True)

    def test_missing_or_changed_backup_digest_prevents_release(self):
        before = states()
        with tempfile.TemporaryDirectory() as temp, patch.object(release, 'EVIDENCE', Path(temp)), patch.object(release.subprocess, 'check_output', return_value='sha256:' + 'a' * 64):
            with self.assertRaises(FileNotFoundError):
                release.require_backups(before)
            for name, state in before.items():
                release.save(name.removeprefix('hidi-') + '-backup.json', {'verified': True,
                    'originalImage': state['image'], 'settingsHash': state['settingsHash'], 'digest': 'sha256:' + 'a' * 64})
            release.require_backups(before)
            bad = release.read('api-backup.json')
            bad['originalImage'] = image('api', 'b')
            release.save('api-backup.json', bad)
            with self.assertRaisesRegex(AssertionError, 'backup'):
                release.require_backups(before)

    def test_changed_retained_suite_or_scope_blocks_candidate_sealing(self):
        with tempfile.TemporaryDirectory() as temp, patch.object(release, 'EVIDENCE', Path(temp)):
            folder = Path(temp)
            values = valid_evidence(folder)
            release.reports_ready()
            for name, field, value in [('api-images.json', 'productionBlobWrites', 1),
                ('admin-runtime.json', 'anonymousAdminDataDenied', False), ('retained-commerce.json', 'liveWrites', 1),
                ('web-preservation.json', 'permissionsPreserved', False)]:
                changed = copy.deepcopy(values[name])
                changed[field] = value
                release.save(name, changed)
                with self.assertRaises(AssertionError):
                    release.reports_ready()
                release.save(name, values[name])
            changed = copy.deepcopy(values['patch.json'])
            changed['allowedFiles'].append('server.mjs')
            release.save('patch.json', changed)
            with self.assertRaisesRegex(AssertionError, 'scope'):
                release.reports_ready()

    def test_retry_proof_rejects_unrelated_bytes_even_with_updated_file_hash(self):
        with tempfile.TemporaryDirectory() as temp, patch.object(release, 'EVIDENCE', Path(temp)):
            values = valid_evidence(Path(temp))
            release.reports_ready()
            row = values['patch.json']['uploadRetryRepair']['files'][0]
            file = release.PRIVATE / 'web/candidate-app' / row['path']
            file.write_bytes(file.read_bytes() + b'// unrelated server change\n')
            row['afterSha256'] = release.sha256(file)
            release.save('patch.json', values['patch.json'])
            with self.assertRaisesRegex(AssertionError, 'unrelated server bytes'):
                release.reports_ready()

    def test_retry_proof_rejects_omitted_original_registered_copy(self):
        with tempfile.TemporaryDirectory() as temp, patch.object(release, 'EVIDENCE', Path(temp)):
            valid_evidence(Path(temp))
            file = release.PRIVATE / 'web/base-app/apps/web/.next/server/chunks/omitted.js'
            file.write_text('exports.modules={' + patcher.OLD_UPLOAD_FACTORY + '};\n')
            with self.assertRaisesRegex(AssertionError, 'Every exact original helper copy'):
                release.reports_ready()

    def test_retry_proof_requires_actual_loaded_guard_and_sdk_conflict(self):
        with tempfile.TemporaryDirectory() as temp, patch.object(release, 'EVIDENCE', Path(temp)):
            values = valid_evidence(Path(temp))
            for target, key, value in [('loadedHelper', 'guardInstalled', False),
                ('currentFactory', 'guardInstalled', False), ('bundledSdkError', 'statusCode', 403),
                ('loadedHelper', 'source', patcher.OLD_UPLOAD_HELPER)]:
                report = copy.deepcopy(values['next-hash.json'])
                report['loadedModuleDiagnostic'][target][key] = value
                release.save('next-hash.json', report)
                with self.assertRaises(AssertionError):
                    release.reports_ready()
            report = copy.deepcopy(values['next-hash.json'])
            report['loadedStorageHelperVerified'] = False
            release.save('next-hash.json', report)
            with self.assertRaises(AssertionError):
                release.reports_ready()

    def test_retry_proof_rejects_false_unchanged_compiled_claim(self):
        with tempfile.TemporaryDirectory() as temp, patch.object(release, 'EVIDENCE', Path(temp)):
            values = valid_evidence(Path(temp))
            report = values['web-preservation.json']
            report['compiledNextUnchanged'] = True
            release.save('web-preservation.json', report)
            with self.assertRaisesRegex(AssertionError, 'Compiled preservation evidence'):
                release.reports_ready()

    def test_image_source_and_report_hashes_are_bound_to_candidate(self):
        with tempfile.TemporaryDirectory() as temp, patch.object(release, 'EVIDENCE', Path(temp)), \
            patch.object(release, 'source_guard'), patch.object(release.photo, 'states', return_value=states()), \
            patch.object(release, 'image_id', return_value='fixture-image-id'):
            values = valid_evidence(Path(temp))
            tested = {'passed': True, 'candidateImageId': 'fixture-image-id', 'sourceSha': os.environ['GITHUB_SHA'],
                'reportManifest': release.report_manifest()}
            release.save('candidate-regression.json', tested)
            release.save('published.json', {'verified': True, 'image': image('web', 'b'), **tested})
            release.require_candidate(image('web', 'b'))
            release.save('candidate/report.json', {**values['candidate/report.json'], 'extra': 'evidence changed'})
            with self.assertRaisesRegex(AssertionError, 'evidence'):
                release.require_candidate(image('web', 'b'))
            release.save('candidate/report.json', values['candidate/report.json'])
            with patch.object(release, 'image_id', return_value='unreviewed-image-id'):
                with self.assertRaisesRegex(AssertionError, 'identity'):
                    release.require_candidate(image('web', 'b'))
            tested['sourceSha'] = 'c' * 40
            release.save('candidate-regression.json', tested)
            with self.assertRaisesRegex(AssertionError, 'source'):
                release.require_candidate(image('web', 'b'))

    def test_missing_failed_or_writeful_actual_next_hash_probe_blocks_release(self):
        with tempfile.TemporaryDirectory() as temp, patch.object(release, 'EVIDENCE', Path(temp)):
            folder = Path(temp)
            reports = valid_evidence(folder)
            release.reports_ready()
            (folder / 'next-hash.json').unlink()
            with self.assertRaises(FileNotFoundError):
                release.reports_ready()
            original = reports['next-hash.json']
            invalid = [('passed', False), ('actualNextHttp', False), ('contentHashVerified', False),
                ('mainAltVerified', False), ('duplicateRetryVerified', False), ('coverByFirstUploadVerified', False),
                ('photoLimitVerified', False), ('requestBodyLimitVerified', False), ('photoLimitBytes', 5 * 1024 * 1024),
                ('requestBodyBytes', 5 * 1024 * 1024), ('productionDatabaseWrites', 1),
                ('productionBlobWrites', 1), ('checks', []), ('checks', [{'status': 'FAIL'}])]
            for key, value in invalid:
                changed = copy.deepcopy(original)
                changed[key] = value
                release.save('next-hash.json', changed)
                with self.assertRaises(AssertionError):
                    release.reports_ready()
            release.save('next-hash.json', original)
            release.reports_ready()

    def test_missing_failed_unbound_or_writeful_actual_api_images_blocks_release(self):
        with tempfile.TemporaryDirectory() as temp, patch.object(release, 'EVIDENCE', Path(temp)):
            folder = Path(temp)
            reports = valid_evidence(folder)
            release.reports_ready()
            (folder / 'api-images.json').unlink()
            with self.assertRaises(FileNotFoundError):
                release.reports_ready()
            original = reports['api-images.json']
            invalid = [('passed', False), ('actualCompiledApi', False), ('coverByFirstUploadVerified', False),
                ('allSizesVerified', False), ('altUpdateVerified', False), ('duplicateMetadataAvoided', False),
                ('existingCoverPreserved', False), ('inventoryWrites', 1), ('productionDatabaseWrites', 1),
                ('productionBlobWrites', 1), ('checks', []), ('checks', [{'status': 'FAIL'}]),
                ('moduleRelativePath', '../../server.mjs'), ('moduleSha256', '0' * 64)]
            for key, value in invalid:
                changed = copy.deepcopy(original)
                changed[key] = value
                release.save('api-images.json', changed)
                with self.assertRaises(AssertionError):
                    release.reports_ready()
            release.save('api-images.json', original)
            module = release.PRIVATE / 'api/base-app' / original['moduleRelativePath']
            module.write_text('unreviewed changed API service')
            with self.assertRaisesRegex(AssertionError, 'compiled service'):
                release.reports_ready()

    def test_actual_api_products_requires_bound_readonly_successful_contracts(self):
        with tempfile.TemporaryDirectory() as temp, patch.object(release, 'EVIDENCE', Path(temp)):
            reports = valid_evidence(Path(temp))
            original = reports['api-products.json']
            release.reports_ready()
            (Path(temp) / 'api-products.json').unlink()
            with self.assertRaises(FileNotFoundError):
                release.reports_ready()
            invalid = [('passed', False), ('actualCompiledApi', False), ('coreCreateVerified', False),
                ('metadataVerified', False), ('variantsVerified', False), ('statusVerified', False),
                ('versionGuardVerified', False), ('zeroStockVerified', False), ('completeReturnVerified', False),
                ('inventoryWrites', 1), ('productionDatabaseWrites', 1), ('productionBlobWrites', 1),
                ('checks', []), ('checks', [{'status': 'FAIL'}]), ('modules', [])]
            for key, value in invalid:
                changed = copy.deepcopy(original)
                changed[key] = value
                release.save('api-products.json', changed)
                with self.assertRaises(AssertionError):
                    release.reports_ready()
            for key, value in [('moduleRelativePath', '../../server.mjs'), ('moduleSha256', '0' * 64)]:
                changed = copy.deepcopy(original)
                changed['modules'][0][key] = value
                release.save('api-products.json', changed)
                with self.assertRaises(AssertionError):
                    release.reports_ready()
            release.save('api-products.json', original)
            release.reports_ready()

    def test_retained_suite_baseline_launcher_helper_source_and_report_are_pinned(self):
        with tempfile.TemporaryDirectory() as temp, patch.object(release, 'EVIDENCE', Path(temp)):
            reports = valid_evidence(Path(temp))
            original = reports['retained-commerce-provenance.json']
            release.verify_retained_provenance(original)
            for key, value in [('passed', False), ('liveWrites', 1), ('baselineSourceSha', 'a' * 40),
                ('executionSourceSha', 'a' * 40), ('helperSha256', 'stale-helper'), ('reportSha256', 'stale-report')]:
                changed = copy.deepcopy(original)
                changed[key] = value
                with self.assertRaises(AssertionError):
                    release.verify_retained_provenance(changed)
            for name in release.RETAINED_SOURCES:
                changed = copy.deepcopy(original)
                changed['sourceHashes'][name] = 'unreleased-source'
                with self.assertRaisesRegex(AssertionError, 'launcher or probes'):
                    release.verify_retained_provenance(changed)

    def test_api_image_revision_settings_and_web_concurrent_changes_stop_before_write(self):
        before = states()
        captured = {'original-public-content': True}
        for kind in ['api-image', 'api-settings', 'web-revision', 'web-settings', 'public']:
            def unchanged(_):
                if kind != 'public':
                    raise AssertionError('Concurrent application change: ' + kind)
            with patch.object(release, 'setup'), patch.object(release.photo, 'states', return_value=before), \
                patch.object(release, 'require_backups'), patch.object(release, 'require_candidate'), \
                patch.object(release.photo, 'unchanged', side_effect=unchanged), \
                patch.object(release.guard, 'private_json', return_value=captured), \
                patch.object(release.guard, 'public_snapshot', return_value={'changed': True}), \
                patch.object(release.guard, 'conditional_write_image') as write:
                with self.assertRaises(AssertionError):
                    release.apply(image('web', 'b'))
                write.assert_not_called()

    def test_successful_apply_writes_only_owned_web_and_never_api_or_data(self):
        before = states()
        public = {'published': 'unchanged'}
        deployed = {**before['hidi-web'], 'image': image('web', 'b'), 'latest': 'hidi-web--' + release.suffix(), 'ready': 'hidi-web--' + release.suffix()}
        writes = []
        with tempfile.TemporaryDirectory() as temp, patch.object(release, 'EVIDENCE', Path(temp)), \
            patch.object(release, 'setup'), patch.object(release.photo, 'states', return_value=before), \
            patch.object(release, 'require_backups'), patch.object(release, 'require_candidate'), \
            patch.object(release.photo, 'unchanged'), patch.object(release.photo, 'originals', return_value={'hidi-web': {'id': 'web-only'}}), \
            patch.object(release.guard, 'private_json', return_value=public), patch.object(release.guard, 'public_snapshot', return_value=public), \
            patch.object(release.guard, 'write_private'), patch.object(release.guard, 'install_interrupt_handler'), \
            patch.object(release.guard, 'conditional_write_image', side_effect=lambda *args: writes.append(args)), \
            patch.object(release.guard, 'wait_ready', return_value=deployed), patch.object(release.cloud, 'snapshot', side_effect=copy.deepcopy), \
            patch.object(release, 'live_assets'):
            release.save('web-preservation.json', {'compiledNextUnchanged': False})
            release.apply(image('web', 'b'))
            result = release.read('after.json')
            self.assertTrue(result['apiUnchanged'])
            self.assertFalse(result['databaseWrites'])
            self.assertFalse(result['blobWrites'])
            self.assertFalse(result['compiledNextUnchanged'])
            self.assertTrue(result['compiledNextPreservedExceptUploadRetry'])
        self.assertEqual(len(writes), 1)
        self.assertEqual(writes[0][:3], ({'id': 'web-only'}, image('web', 'b'), release.suffix()))

    def test_owned_failed_rollout_uses_recovery_and_records_failure_without_api_writes(self):
        before = states()
        public = {'original-public-content': True}
        marker = {'attempted': True, 'mayComplete': True}
        with tempfile.TemporaryDirectory() as temp, patch.object(release, 'EVIDENCE', Path(temp)), \
            patch.object(release, 'setup'), patch.object(release.photo, 'states', return_value=before), \
            patch.object(release, 'require_backups'), patch.object(release, 'require_candidate'), \
            patch.object(release.photo, 'unchanged'), patch.object(release.photo, 'originals', return_value={'hidi-web': {'id': 'web-only'}}), \
            patch.object(release.guard, 'private_json', side_effect=lambda name: marker if name == 'forward-write.json' else public), \
            patch.object(release.guard, 'public_snapshot', return_value=public), patch.object(release.guard, 'write_private'), \
            patch.object(release.guard, 'install_interrupt_handler'), patch.object(release.guard, 'conditional_write_image', side_effect=RuntimeError('lost ARM response')), \
            patch.object(release.guard, 'reconcile_failure', return_value={'passed': True, 'webStatus': 'restored'}) as reconcile:
            with self.assertRaisesRegex(RuntimeError, 'lost ARM'):
                release.apply(image('web', 'b'))
            reconcile.assert_called_once_with(image('web', 'b'), before, public, public, release.suffix(), True)
            result = release.read('rollback.json')
            self.assertFalse(result['apiWrites'])
            self.assertFalse(result['databaseWrites'])
            self.assertFalse(result['blobWrites'])

    def test_conditional_arm_rejects_state_change_and_retains_complete_container_settings(self):
        original = {'id': '/subscriptions/fixture/resourceGroups/fixture/providers/Microsoft.App/containerApps/hidi-web',
            'location': 'fixture', 'state': states()['hidi-web'], 'properties': {'template': {'containers': [
                {'name': 'web', 'image': image('web', 'a'), 'env': [{'name': 'PROTECTED', 'secretRef': 'protected'}],
                    'resources': {'cpu': 1}, 'probes': [{'type': 'Readiness'}]}]}}}
        calls = []
        def request(method, _, token, body=None, etag=None):
            calls.append((method, body, etag))
            return (copy.deepcopy(original), 'fixture-etag', None, 200, None)
        with patch.object(release.cloud, 'snapshot', side_effect=lambda value: copy.deepcopy(value['state'])), \
            patch.object(release.guard, 'arm_token', return_value='fixture-token'), patch.object(release.guard, 'arm_request', side_effect=request):
            release.guard.conditional_write_image(original, image('web', 'b'), release.suffix())
        self.assertEqual([row[0] for row in calls], ['GET', 'PATCH'])
        body = calls[-1][1]
        self.assertEqual(set(body['properties']), {'template'})
        self.assertEqual(body['properties']['template']['containers'][0]['env'], original['properties']['template']['containers'][0]['env'])
        self.assertEqual(body['properties']['template']['containers'][0]['resources'], {'cpu': 1})
        self.assertEqual(body['properties']['template']['containers'][0]['probes'], [{'type': 'Readiness'}])
        self.assertEqual(calls[-1][2], 'fixture-etag')
        changed = copy.deepcopy(original)
        changed['state']['latest'] = 'independent-revision'
        with patch.object(release.cloud, 'snapshot', side_effect=lambda value: value['state']), \
            patch.object(release.guard, 'arm_token', return_value='fixture-token'), \
            patch.object(release.guard, 'arm_request', return_value=(changed, None, None, 200, None)) as arm:
            with self.assertRaisesRegex(AssertionError, 'changed'):
                release.guard.conditional_write_image(original, image('web', 'b'), release.suffix())
            self.assertEqual(arm.call_count, 1)

    def test_actual_recovery_restores_only_the_owned_web_image_using_fresh_settings(self):
        before = states()
        owned = {**before['hidi-web'], 'image': image('web', 'b'), 'latest': 'hidi-web--' + release.suffix(),
            'ready': 'hidi-web--' + release.suffix(), 'settingsHash': 'independently-updated-settings'}
        current = {'hidi-web': owned, 'hidi-api': before['hidi-api']}
        writes = []
        def app(name):
            return {'name': name, 'state': copy.deepcopy(current[name])}
        def write(data, target, revision):
            writes.append((data['name'], target, revision, data['state']['settingsHash']))
            current[data['name']] = {**data['state'], 'image': target, 'latest': 'hidi-web--' + revision,
                'ready': 'hidi-web--' + revision}
        with patch.object(release.cloud, 'app', side_effect=app), \
            patch.object(release.cloud, 'snapshot', side_effect=lambda data: copy.deepcopy(data['state'])), \
            patch.object(release.guard, 'conditional_write_image', side_effect=write), \
            patch.object(release.guard, 'wait_restored', side_effect=lambda *args: app('hidi-web')), \
            patch.object(release.guard, 'settle_restored_public', return_value={'publicSnapshotRestored': True}):
            result = release.guard.reconcile_failure(image('web', 'b'), before, {'published': True}, {'published': True}, release.suffix())
        self.assertEqual(result['webStatus'], 'restored')
        self.assertTrue(result['apiUnchanged'])
        self.assertTrue(result['webSettingsPreservedDuringRecovery'])
        self.assertFalse(result['webSettingsUnchangedFromCapture'])
        self.assertEqual(writes, [('hidi-web', image('web', 'a'), 'rangefiverb123a2', 'independently-updated-settings')])
        self.assertEqual(current['hidi-api'], before['hidi-api'])

    def test_actual_recovery_preserves_a_separate_independent_deployment(self):
        before = states()
        current = {'hidi-web': {**before['hidi-web'], 'image': image('web', 'c'),
            'latest': 'hidi-web--independent', 'ready': 'hidi-web--independent'}, 'hidi-api': before['hidi-api']}
        with patch.object(release.cloud, 'app', side_effect=lambda name: copy.deepcopy(current[name])), \
            patch.object(release.cloud, 'snapshot', side_effect=copy.deepcopy), \
            patch.object(release.guard, 'conditional_write_image') as write:
            result = release.guard.reconcile_failure(image('web', 'b'), before, {}, {}, release.suffix())
        self.assertTrue(result['passed'])
        self.assertEqual(result['webStatus'], 'independent-change-not-overwritten')
        write.assert_not_called()


if __name__ == '__main__':
    unittest.main()
