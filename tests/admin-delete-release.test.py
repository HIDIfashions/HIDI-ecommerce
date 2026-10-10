"""Meaningful failure-boundary checks for the product deletion release."""
import copy
import importlib.util
import json
import hashlib
import base64
import gzip
import os
from pathlib import Path
import tempfile
import subprocess
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('admin_delete_release_test', ROOT / 'deploy/admin-delete/release.py')
release = importlib.util.module_from_spec(spec); spec.loader.exec_module(release)
schema_spec = importlib.util.spec_from_file_location('admin_delete_schema_console_test', ROOT / 'deploy/admin-delete/schema-readiness.py')
schema_console = importlib.util.module_from_spec(schema_spec); schema_spec.loader.exec_module(schema_console)

def image(app, marker):
    return release.helpers.REGISTRY + '/hidi-' + app + '@sha256:' + marker * 64

class ReleaseGuards(unittest.TestCase):
    def test_runtime_changes_only_the_retained_handler_call_and_is_idempotent(self):
        source = 'const origin = new URL("http://localhost");\nconst hasStorefront = true;\n  if (await handleQuickTools(request, response, pathname)) return;\n// retained storefront\n'
        candidate = release.patcher.patch(source)
        self.assertEqual(candidate.replace(', { origin, hasStorefront }', ''), source)
        self.assertEqual(release.patcher.patch(candidate), candidate)
        for bad in [source + source, source.replace('handleQuickTools', 'unknownHandler')]:
            with self.assertRaises(AssertionError): release.patcher.patch(bad)

    def test_mutable_images_and_cross_repository_images_are_rejected(self):
        release.immutable(image('api', 'a'), 'api')
        for invalid in [release.helpers.REGISTRY + '/hidi-api:' + 'a' * 40, image('web', 'a'), 'unrelated.invalid/hidi-api@sha256:' + 'a' * 64]:
            with self.assertRaises(AssertionError): release.immutable(invalid, 'api')

    def test_read_only_schema_readiness_is_required_and_tied_to_the_exact_captured_api(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            report = {'passed': True, 'apiImage': image('api', 'a'), 'apiSettingsHash': 'retained', 'applicationRowsModified': False, 'applicationRowsQueried': False, 'ddlExecuted': False, 'schemaChanged': False, 'columnType': 'nvarchar', 'columnMaxLength': 80, 'columnNullable': False, 'slugColumnType': 'nvarchar', 'slugColumnMaxLength': 382, 'slugColumnNullable': False}
            for field in ['readOnly', 'existingProductSchema', 'trustedConstraint', 'productColumnsVerified', 'dmlCapabilitiesVerified', 'privateNetwork', 'managedIdentity']: report[field] = True
            state = {'image': report['apiImage'], 'settingsHash': report['apiSettingsHash']}
            with patch.object(release, 'evidence', root):
                with self.assertRaisesRegex(AssertionError, 'required'): release.require_schema_ready(state)
                target = root / 'schema-ready.json'; target.write_text(json.dumps(report))
                self.assertTrue(release.require_schema_ready(state)['passed'])
                for field, invalid in [('passed', False), ('apiImage', image('api', 'b')), ('apiSettingsHash', 'other'), ('trustedConstraint', False), ('applicationRowsModified', True), ('ddlExecuted', True), ('existingProductSchema', False), ('slugColumnMaxLength', 191), ('schemaChanged', True)]:
                    altered = copy.deepcopy(report); altered[field] = invalid; target.write_text(json.dumps(altered))
                    with self.assertRaises(AssertionError): release.require_schema_ready(state)

    def test_private_console_code_is_chunked_below_terminal_limits(self):
        module = (ROOT / 'deploy/admin-delete/schema-readiness.mjs').read_text()
        payload = json.dumps({'module': module}, separators=(',', ':')).encode()
        packed = base64.b64encode(gzip.compress(payload, mtime=0)).decode()
        command = schema_console.console_command(packed, "fixture database with ' quoted name")
        self.assertTrue(all(len(line.encode()) < 2000 for line in command.splitlines()))
        self.assertTrue(command.startswith('node --input-type=commonjs - '))
        self.assertIn("<<'HIDI_DELETE_SCHEMA_NODE'", command)
        self.assertIn('process.argv[2]', command)
        self.assertGreater(len([line for line in command.splitlines() if line.startswith('"')]), 1)
        self.assertNotIn('ALTER TABLE', command)
        self.assertEqual(json.loads(gzip.decompress(base64.b64decode(packed)))['module'], module)
        self.assertNotIn('migration', json.loads(gzip.decompress(base64.b64decode(packed))))

    def test_private_console_heredoc_preserves_literals_and_passes_the_database_argument(self):
        literal = "Review literal '$()' and `backticks` without shell expansion\nexact second line"
        payload = {'module': 'export async function run(database){const literal=' + json.dumps(literal) + ';console.log(JSON.stringify({literal,database}));}'}
        packed = base64.b64encode(gzip.compress(json.dumps(payload).encode(), mtime=0)).decode()
        database = "fixture database with ' quoted name"
        command = schema_console.console_command(packed, database)
        result = subprocess.run(['bash'], input=command, text=True, capture_output=True, timeout=10)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(json.loads(result.stdout), {'literal': literal, 'database': database})

    def test_read_only_console_selects_diagnose_and_does_not_call_apply(self):
        payload = {'module': 'export async function run(){throw Error("unexpected DDL");} export async function diagnose(database){console.log(JSON.stringify({readOnly:true,database}));}'}
        packed = base64.b64encode(gzip.compress(json.dumps(payload).encode(), mtime=0)).decode()
        command = schema_console.console_command(packed, 'fixture', diagnose=True)
        result = subprocess.run(['bash'], input=command, text=True, capture_output=True, timeout=10)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(json.loads(result.stdout), {'readOnly': True, 'database': 'fixture'})
        self.assertNotIn('module.run(', command)

    def test_failure_reports_preserve_static_ids_and_only_allowlisted_schema_metadata(self):
        payload = {'failureCode': 'PRODUCT_STATUS_COLUMN_MAX_LENGTH', 'diagnostics': {'columnType': 'nvarchar', 'columnMaxLength': 40, 'columnNullable': False, 'statusLiterals': ['ACTIVE', 'ARCHIVED', 'DRAFT'], 'definition': 'private SQL text', 'database': 'private database', 'connectionString': 'private connection'}}
        result = schema_console.parse_failure('HIDI_DELETE_SCHEMA_FAILED::' + json.dumps(payload))
        self.assertEqual(result['failureCode'], payload['failureCode']); self.assertEqual(result['diagnostics']['columnMaxLength'], 40)
        self.assertFalse(any(key in result['diagnostics'] for key in ['definition', 'database', 'connectionString']))
        self.assertNotIn('private', json.dumps(result))
        self.assertEqual(schema_console.parse_failure('no marker')['failureCode'], 'CONSOLE_CHECK_INCOMPLETE')
        self.assertEqual(schema_console.parse_failure('HIDI_DELETE_SCHEMA_FAILED::{"failureCode":"unsafe value"}')['failureCode'], 'SCHEMA_HELPER_FAILED')

    def test_terminal_marker_requires_a_complete_valid_nested_json_line(self):
        marker = 'HIDI_DELETE_SCHEMA_DIAGNOSTIC'
        nested = {'readOnly': True, 'availableProductChecks': [{'name': 'Product_status_values', 'trusted': True}]}
        text = marker + '::' + json.dumps(nested)
        first_closing_brace = text.index('}') + 1
        self.assertIsNone(schema_console.complete_marker(text[:first_closing_brace], marker))
        self.assertIsNone(schema_console.complete_marker(text, marker))
        self.assertEqual(schema_console.complete_marker(text + '\r\n', marker), nested)
        self.assertIsNone(schema_console.complete_marker(text + '\r\r', marker))
        self.assertEqual(schema_console.complete_marker(text + '\r\r\n', marker), nested)
        self.assertEqual(schema_console.complete_marker('\x1b[32m' + text + '\x1b[0m\r\r\n', marker), nested)
        self.assertIsNone(schema_console.complete_marker(marker + '::{bad json}\n', marker))

    def test_api_protects_unreviewed_files_baseline_and_runtime_configuration(self):
        with tempfile.TemporaryDirectory() as temp:
            private = Path(temp); base = private / 'base'; candidate = private / 'candidate'
            for stem in release.API_STEMS:
                name = 'apps/api/dist/' + stem + '.js'
                for root, content in [(base, 'baseline:' + stem), (candidate, 'new:' + stem), (private / 'baseline-source', 'baseline:' + stem)]:
                    target = root / name; target.parent.mkdir(parents=True, exist_ok=True); target.write_text(content)
            config = {'Config': {'Cmd': ['node', 'apps/api/dist/main.js']}, 'RootFS': {'Layers': ['retained']}}
            newer = copy.deepcopy(config); newer['RootFS']['Layers'].append('overlay')
            with patch.object(release, 'private', private):
                self.assertTrue(release.verify(base, candidate, 'api', [config, newer])['passed'])
                rogue = candidate / 'unreviewed.js'; rogue.write_text('unexpected')
                with self.assertRaisesRegex(AssertionError, 'outside'): release.verify(base, candidate, 'api', [config, newer])
                rogue.unlink()
                target = base / 'apps/api/dist/admin/products/product-input.js'; target.write_text('different live deployment')
                with self.assertRaisesRegex(AssertionError, 'baseline'): release.verify(base, candidate, 'api', [config, newer])
                target.write_text('baseline:admin/products/product-input')
                bad_config = copy.deepcopy(newer); bad_config['Config']['Env'] = ['UNREVIEWED=true']
                with self.assertRaisesRegex(AssertionError, 'configuration'): release.verify(base, candidate, 'api', [config, bad_config])
                bad_layers = copy.deepcopy(newer); bad_layers['RootFS']['Layers'][0] = 'changed'
                with self.assertRaisesRegex(AssertionError, 'layers'): release.verify(base, candidate, 'api', [config, bad_layers])

    def test_web_preserves_storefront_and_private_runtime_files(self):
        with tempfile.TemporaryDirectory() as temp:
            private = Path(temp); base = private / 'base'; candidate = private / 'candidate'
            for root in [base, candidate]:
                (root / 'apps/web').mkdir(parents=True); (root / 'apps/web/server.js').write_text('retained storefront')
                (root / 'dist').mkdir(); (root / 'dist/index.html').write_text('retained landing')
                (root / 'admin-tools').mkdir(); (root / 'hero-media.mjs').write_text('retained storage auth')
            source = 'const origin = new URL("http://localhost");\nconst hasStorefront = true;\n  if (await handleQuickTools(request, response, pathname)) return;\n'
            (base / 'server.mjs').write_text(source); (candidate / 'server.mjs').write_text(release.patcher.patch(source))
            for name in release.WEB_ASSETS:
                (candidate / 'admin-tools' / name).write_bytes((release.ROOT / 'admin-tools' / name).read_bytes())
            config = {'Config': {'Cmd': ['node', 'server.mjs']}, 'RootFS': {'Layers': ['retained']}}
            newer = copy.deepcopy(config); newer['RootFS']['Layers'].append('overlay')
            self.assertTrue(release.verify(base, candidate, 'web', [config, newer])['passed'])
            (candidate / 'dist/index.html').write_text('changed landing')
            with self.assertRaisesRegex(AssertionError, 'outside'): release.verify(base, candidate, 'web', [config, newer])

    def test_rollback_continues_restoring_api_if_web_restore_fails(self):
        with tempfile.TemporaryDirectory() as temp:
            private = Path(temp); states = {}; writes = []
            for app in ['api', 'web']:
                name = 'hidi-' + app
                states[name] = {'name': name, 'image': image(app, 'a'), 'settingsHash': 'retained-settings'}
                (private / (name + '.json')).write_text(json.dumps(states[name]))
            original = copy.deepcopy(states)
            def write(data, target, suffix):
                writes.append((data['name'], target, suffix))
                if data['name'] == 'hidi-web' and target == original['hidi-web']['image']:
                    raise RuntimeError('Simulated web rollback failure')
                states[data['name']]['image'] = target
            with patch.object(release, 'private', private), patch.object(release, 'evidence', private / 'evidence'), patch.object(release.cloud, 'app', lambda name: copy.deepcopy(states[name])), patch.object(release.cloud, 'snapshot', copy.deepcopy), patch.object(release.cloud, 'write_image', write), patch.object(release, 'wait_ready', lambda name, *_: copy.deepcopy(states[name])), patch.object(release, 'public_state', lambda: {'unchanged': 'hash'}), patch.object(release, 'require_schema_ready', lambda _: {'passed': True}), patch.object(release, 'verify_live_routes', side_effect=RuntimeError('Simulated verification failure')), patch.dict(os.environ, {'GITHUB_RUN_ID': '123'}):
                with self.assertRaisesRegex(RuntimeError, 'verification failure'):
                    release.apply(image('api', 'b'), image('web', 'b'))
            self.assertEqual(states['hidi-api']['image'], original['hidi-api']['image'])
            report = json.loads((private / 'evidence/rollback.json').read_text())
            self.assertEqual(report['restoredApps'], ['hidi-api']); self.assertEqual(report['failedApps'], ['hidi-web'])
            self.assertFalse(report['schemaMutations'])
            self.assertEqual(len(writes), 4)

if __name__ == '__main__': unittest.main()
