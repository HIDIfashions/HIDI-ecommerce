"""Failure boundaries and SDK behavior for the exact retained Blob upload repair."""
import hashlib
import importlib.util
import json
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location('product_upload_retry_patch_test', ROOT / 'deploy/product-upload/patch-runtime.py')
patcher = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(patcher)
SERVER = Path('apps/web/.next/server')


def sha(value):
    return hashlib.sha256(value).hexdigest()


def bundle(factory):
    return ('"use strict";exports.modules={' + factory + ',99999:(a,b,c)=>{b.retained="unrelated module"}};\n').encode()


def tree_bytes(root):
    return {file.relative_to(root).as_posix(): file.read_bytes() for file in root.rglob('*') if file.is_file() and not file.is_symlink()}


class ExactRuntimeRepair(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='hidi-upload-retry-tests-')
        self.root = Path(self.temp.name)
        self.base = self.root / 'base'
        self.overlay = self.root / 'overlay'
        (self.base / SERVER).mkdir(parents=True)
        self.overlay.mkdir()

    def tearDown(self):
        self.temp.cleanup()

    def write(self, name, factory=None):
        path = self.base / SERVER / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(bundle(factory or patcher.OLD_UPLOAD_FACTORY))
        path.chmod(0o640)
        return path

    def assert_rejected_unchanged(self):
        original = tree_bytes(self.base)
        previous_overlay = tree_bytes(self.overlay)
        with self.assertRaises((AssertionError, UnicodeError)):
            patcher.patch_upload_retry(self.base, self.overlay)
        self.assertEqual(tree_bytes(self.base), original)
        self.assertEqual(tree_bytes(self.overlay), previous_overlay)

    def test_proven_helper_and_export_factory_hashes_are_fixed(self):
        self.assertEqual(patcher.MODULE_ID, 80441)
        self.assertEqual(sha(patcher.OLD_UPLOAD_HELPER.encode()), 'c8a90498b6228a163576fa02da7b069c98a1afb2b4bd63298ebb45d9d5772f48')
        self.assertEqual(sha(patcher.NEW_UPLOAD_HELPER.encode()), 'bb9c734288bda472461a8bb3fc3f6b58fdd48449972354f271a10195a184a760')
        self.assertEqual(sha(patcher.EXISTING_GUARDED_HELPER.encode()), 'd0aea5457f0161e44f619ed2ef358afa6db0f22199514d807249d2f847f3a0a9')
        self.assertEqual(sha(patcher.OLD_UPLOAD_FACTORY.removeprefix('80441:').encode()), '91b13a59b37b350ccd205c5aff2d80b46134d919f1db5f3fa7c4f45cb65d4e39')

    def test_all_registered_cache_copies_are_repaired_with_inverse_byte_proof(self):
        names = ['chunks/100.js', 'app/api/admin/inventory/[id]/images/route.js', 'app/products/[slug]/page.js']
        for name in names:
            self.write(name)
        self.write('chunks/already-guarded.js', patcher.NEW_UPLOAD_FACTORY)
        self.write('chunks/previous-newline-guard.js', patcher.EXISTING_GUARDED_FACTORY)
        unrelated = self.base / SERVER / 'chunks/unrelated.js'
        unrelated.write_text('exports.modules={12345:(a,b,c)=>{b.value="retained"}};\n')
        original = tree_bytes(self.base)
        report = patcher.patch_upload_retry(self.base, self.overlay)
        self.assertTrue(report['passed'])
        self.assertEqual(report['moduleId'], 80441)
        self.assertEqual(report['copiesScanned'], 5)
        self.assertEqual(report['copiesPatched'], 3)
        self.assertEqual(report['copiesAlreadyGuarded'], 2)
        expected = sorted((SERVER / name).as_posix() for name in names)
        self.assertEqual(report['changedFiles'], expected)
        self.assertEqual(sorted(tree_bytes(self.overlay)), expected)
        self.assertEqual(tree_bytes(self.base), original)
        self.assertIn(b'\nlet e=g().getBlockBlobClient(a);', (self.base / SERVER / 'chunks/previous-newline-guard.js').read_bytes())
        self.assertFalse((self.overlay / SERVER / 'chunks/previous-newline-guard.js').exists())
        for item in report['files']:
            before = original[item['path']]
            candidate = (self.overlay / item['path']).read_bytes()
            self.assertEqual(item['copies'], 1)
            self.assertEqual(item['beforeSha256'], sha(before))
            self.assertEqual(item['afterSha256'], sha(candidate))
            self.assertTrue(item['inverseTransformsVerified'])
            self.assertEqual(candidate.replace(patcher.NEW_UPLOAD_HELPER.encode(), patcher.OLD_UPLOAD_HELPER.encode()), before)
            self.assertEqual((self.overlay / item['path']).stat().st_mode & 0o777, 0o640)
            result = subprocess.run(['node', '--check', str(self.overlay / item['path'])], capture_output=True, text=True, timeout=10)
            self.assertEqual(result.returncode, 0, result.stderr)

    def test_already_guarded_runtime_is_reported_without_overlay_changes(self):
        self.write('chunks/helper.js', patcher.NEW_UPLOAD_FACTORY)
        original = tree_bytes(self.base)
        report = patcher.patch_upload_retry(self.base, self.overlay)
        self.assertEqual(report['copiesScanned'], 1)
        self.assertEqual(report['copiesPatched'], 0)
        self.assertEqual(report['copiesAlreadyGuarded'], 1)
        self.assertEqual(report['changedFiles'], [])
        self.assertEqual(report['files'], [])
        self.assertEqual(tree_bytes(self.overlay), {})
        self.assertEqual(tree_bytes(self.base), original)

    def test_unknown_helper_or_factory_shape_is_rejected_before_valid_copies_are_written(self):
        invalid_factories = [
            patcher.OLD_UPLOAD_FACTORY.replace('max-age=31536000', 'max-age=300', 1),
            patcher.OLD_UPLOAD_FACTORY.replace('i:()=>h', 'i:()=>g', 1),
            patcher.OLD_UPLOAD_FACTORY.replace('80441:', '80442:', 1),
            patcher.OLD_UPLOAD_FACTORY.replace('c(55031)', 'c(55032)', 1),
            patcher.OLD_UPLOAD_FACTORY + ',' + patcher.OLD_UPLOAD_FACTORY,
            patcher.OLD_UPLOAD_FACTORY + ';' + patcher.OLD_UPLOAD_HELPER,
            patcher.OLD_UPLOAD_FACTORY + 'UnexpectedTrailingFactoryToken',
            patcher.EXISTING_GUARDED_FACTORY.replace('\nlet e=g()', '\n\nlet e=g()', 1),
            patcher.EXISTING_GUARDED_FACTORY.replace(patcher.EXISTING_GUARDED_HELPER, patcher.EXISTING_GUARDED_HELPER + ' ', 1),
        ]
        for factory in invalid_factories:
            with self.subTest(factory=factory[:100]):
                self.write('chunks/a-valid.js')
                self.write('chunks/z-drifted.js', factory)
                self.assert_rejected_unchanged()

    def test_unregistered_identical_helper_and_missing_registered_copies_are_rejected(self):
        path = self.base / SERVER / 'chunks/unregistered.js'
        path.parent.mkdir()
        path.write_text(patcher.OLD_UPLOAD_HELPER + '\n')
        self.assert_rejected_unchanged()
        path.write_text('exports.modules={99999:(a,b,c)=>{b.value="retained"}};')
        self.assert_rejected_unchanged()

    def test_server_source_symlink_is_rejected_without_writes(self):
        self.write('chunks/a-valid.js')
        outside = self.root / 'outside.js'
        outside.write_bytes(bundle(patcher.OLD_UPLOAD_FACTORY))
        (self.base / SERVER / 'chunks/z-link.js').symlink_to(outside)
        self.assert_rejected_unchanged()
        self.assertEqual(outside.read_bytes(), bundle(patcher.OLD_UPLOAD_FACTORY))

    def test_server_directory_symlink_is_rejected_without_writes(self):
        self.write('chunks/a-valid.js')
        outside = self.root / 'outside-dir'
        outside.mkdir()
        (outside / 'helper.js').write_bytes(bundle(patcher.OLD_UPLOAD_FACTORY))
        (self.base / SERVER / 'linked-dir').symlink_to(outside, target_is_directory=True)
        self.assert_rejected_unchanged()

    def test_base_root_symlink_is_not_accepted_as_a_proven_runtime_tree(self):
        self.write('chunks/helper.js')
        alias = self.root / 'base-alias'
        alias.symlink_to(self.base, target_is_directory=True)
        with self.assertRaises(AssertionError):
            patcher.patch_upload_retry(alias, self.overlay)
        self.assertEqual(tree_bytes(self.overlay), {})

    def test_existing_overlay_path_is_rejected_before_any_new_file_is_written(self):
        self.write('chunks/a-valid.js')
        self.write('chunks/z-collision.js')
        collision = self.overlay / SERVER / 'chunks/z-collision.js'
        collision.parent.mkdir(parents=True)
        collision.write_text('another authorized overlay owns this path')
        self.assert_rejected_unchanged()

    def test_overlay_parent_symlink_cannot_redirect_the_repair_outside_overlay(self):
        self.write('chunks/helper.js')
        outside = self.root / 'outside-overlay'
        outside.mkdir()
        overlay_server = self.overlay / SERVER
        overlay_server.mkdir(parents=True)
        (overlay_server / 'chunks').symlink_to(outside, target_is_directory=True)
        self.assert_rejected_unchanged()
        self.assertEqual(list(outside.iterdir()), [])

    def test_changed_file_after_scan_is_rejected_without_partial_overlay(self):
        path = self.write('chunks/helper.js')
        captured = patcher.scan_upload_retry(self.base)
        path.write_bytes(path.read_bytes() + b'// concurrent runtime replacement\n')
        with patch.object(patcher, 'scan_upload_retry', return_value=captured):
            self.assert_rejected_unchanged()

    def test_non_utf8_server_module_is_rejected_without_writes(self):
        self.write('chunks/a-valid.js')
        (self.base / SERVER / 'chunks/z-binary.js').write_bytes(b'\xff\xfe')
        self.assert_rejected_unchanged()


class GuardedBlobBehavior(unittest.TestCase):
    def test_registered_export_runs_actual_helper_against_a_mock_azure_sdk(self):
        script = r'''
const assert=require('node:assert/strict');
const modules={FACTORY};
const expected=Buffer.from('immutable image fixture');
const batch='products/variants/variant_1/batch-'+'a'.repeat(64)+'.jpg';
const passed=[];
async function run(config={}) {
  const calls=[];
  const storageError=Object.assign(new Error('Storage status '+config.status),{statusCode:config.status});
  const block={
    async uploadData(data,options){calls.push(['uploadData',Buffer.from(data).toString('hex'),options]);if(config.status)throw storageError;return {requestId:'fixture'}},
    async getProperties(){calls.push(['getProperties']);if(config.readFailure)throw config.readFailure;return {contentLength:config.length??expected.length,contentType:config.type??'image/jpeg'}},
    async downloadToBuffer(offset,length){calls.push(['downloadToBuffer',offset,length]);return config.bytes??expected},
  };
  class Credential {}
  class BlobServiceClient {
    constructor(url,credential){assert.equal(url,'https://hidifixture.blob.core.windows.net');assert.ok(credential instanceof Credential)}
    getContainerClient(name){assert.equal(name,'product-media');return {getBlockBlobClient(key){calls.push(['getBlockBlobClient',key]);return block}}}
  }
  const load=id=>id===36742?{gv:Credential}:id===55031?{wS:BlobServiceClient}:assert.fail('Unrelated SDK module '+id);
  load.d=(exports,definitions)=>{for(const [key,get] of Object.entries(definitions))Object.defineProperty(exports,key,{get})};
  process.env.MEDIA_PUBLIC_BASE_URL='https://media.invalid/';process.env.AZURE_STORAGE_ACCOUNT='hidifixture';
  const exports={};modules[80441]({},exports,load);
  assert.equal(typeof exports.i,'function');assert.equal(typeof exports.P,'function');
  let saved,error;try{saved=await exports.i(config.key??batch,expected,'image/jpeg')}catch(caught){error=caught}
  return {saved,error,calls,storageError};
}
(async()=>{
  const fresh=await run();assert.ifError(fresh.error);assert.deepEqual(fresh.saved,{url:'https://media.invalid/'+batch,storagePath:'azure://product-media/'+batch});
  assert.equal(fresh.calls.filter(c=>c[0]==='uploadData').length,1);assert.ok(!fresh.calls.some(c=>c[0]==='getProperties'||c[0]==='downloadToBuffer'));
  assert.deepEqual(fresh.calls.find(c=>c[0]==='uploadData')[2],{conditions:{ifNoneMatch:'*'},blobHTTPHeaders:{blobContentType:'image/jpeg',blobCacheControl:'public, max-age=31536000, immutable'}});passed.push('fresh immutable upload unchanged');
  const legacyFresh=await run({key:'products/variants/variant_1/manual-photo.jpg'});assert.ifError(legacyFresh.error);assert.deepEqual(legacyFresh.saved,{url:'https://media.invalid/products/variants/variant_1/manual-photo.jpg',storagePath:'azure://product-media/products/variants/variant_1/manual-photo.jpg'});assert.ok(!legacyFresh.calls.some(c=>c[0]==='getProperties'));passed.push('fresh legacy upload unchanged');
  for(const status of [409,412]){const retried=await run({status});assert.ifError(retried.error);assert.deepEqual(retried.saved,fresh.saved);assert.deepEqual(retried.calls.filter(c=>c[0]==='downloadToBuffer').map(c=>c.slice(1)),[[0,expected.length]]);passed.push('exact immutable '+status+' content recovered')}
  for(const mismatch of [{length:expected.length+1},{type:'image/png'},{bytes:Buffer.from('x'.repeat(expected.length))}]){const bad=await run({status:412,...mismatch});assert.match(bad.error.message,/differs/);assert.equal(bad.saved,undefined);passed.push('mismatching saved content rejected')}
  for(const key of ['products/variants/variant_1/random-photo.jpg','products/product_1/batch-'+'a'.repeat(64)+'.jpg','products/variants/variant_1/batch-'+ 'a'.repeat(64)+'.gif']){const legacy=await run({status:412,key});assert.equal(legacy.error,legacy.storageError);assert.ok(!legacy.calls.some(c=>c[0]==='getProperties'));passed.push('legacy or unrelated key preserved')}
  for(const status of [400,401,403,404,500]){const rejected=await run({status});assert.equal(rejected.error,rejected.storageError);assert.ok(!rejected.calls.some(c=>c[0]==='getProperties'));passed.push('unrelated storage '+status+' preserved')}
  const readFailure=new Error('Read permission denied');const unreadable=await run({status:412,readFailure});assert.equal(unreadable.error,readFailure);passed.push('read failure rejected');
  const invalid=await run({key:'products/variants/../unsafe.jpg'});assert.match(invalid.error.message,/Invalid product image key/);assert.equal(invalid.calls.length,0);passed.push('unsafe key denied before SDK');
  process.stdout.write(JSON.stringify({passed:true,checks:passed.length}));
})().catch(error=>{console.error(error);process.exitCode=1});
'''
        with tempfile.TemporaryDirectory(prefix='hidi-retry-node-') as folder:
            path = Path(folder) / 'helper.cjs'
            for name, factory in [('new', patcher.NEW_UPLOAD_FACTORY), ('existing-newline', patcher.EXISTING_GUARDED_FACTORY)]:
                with self.subTest(factory=name):
                    path.write_text(script.replace('FACTORY', factory))
                    checked = subprocess.run(['node', '--check', str(path)], capture_output=True, text=True, timeout=10)
                    self.assertEqual(checked.returncode, 0, checked.stderr)
                    executed = subprocess.run(['node', str(path)], capture_output=True, text=True, timeout=10)
                    self.assertEqual(executed.returncode, 0, executed.stderr)
                    result = json.loads(executed.stdout)
                    self.assertTrue(result['passed'])
                    self.assertEqual(result['checks'], 17)


if __name__ == '__main__':
    unittest.main()
