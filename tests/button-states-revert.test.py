"""Failure boundaries for the four-file button-only inverse and web-owned rollback."""
import copy
import importlib.util
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('button_states_revert_test', ROOT / 'deploy/button-states/revert.py')
revert = importlib.util.module_from_spec(spec); spec.loader.exec_module(revert)

def state(app, image=None):
    return {'image': image or (revert.OWNED_WEB if app == 'web' else revert.REGISTRY + '/hidi-api@sha256:' + 'c' * 64), 'settingsHash': app + '-retained-settings', 'latest': 'hidi-' + app + '--original', 'ready': 'hidi-' + app + '--original', 'mode': 'Single'}

def report():
    return {'passed': True, 'sourceThemeInjected': False, 'liveWrites': 0, 'examinedControls': 10, 'results': [{'engine': engine, 'width': width, 'height': height, 'status': 'PASS'} for engine, width, height in revert.EXPECTED_COVERAGE]}

class RevertGuards(unittest.TestCase):
    def test_exact_inverse_preserves_all_compiled_and_admin_files(self):
        with tempfile.TemporaryDirectory() as temp:
            target, current = Path(temp) / 'target', Path(temp) / 'current'
            for folder in [target, current]:
                for name in revert.PROTECTED_FILES + ['apps/web/.next/static/test.js']:
                    file = folder / name; file.parent.mkdir(parents=True, exist_ok=True); file.write_text('retained:' + name)
            (target / 'server.mjs').write_text('original-runtime'); (current / 'server.mjs').write_text('exact-theme-runtime')
            for name in revert.ASSETS:
                file = current / 'button-states' / name; file.parent.mkdir(exist_ok=True); file.write_bytes((revert.HERE / name).read_bytes())
            old = {'Config': {'Cmd': ['node', 'server.mjs']}, 'RootFS': {'Layers': ['retained']}}
            new = copy.deepcopy(old); new['RootFS']['Layers'].append('only-theme-layer')
            with patch.object(revert.patcher, 'patch_runtime', lambda _: 'exact-theme-runtime'):
                self.assertTrue(revert.verify(target, current, [old, new])['passed'])
                for name in ['apps/web/.next/static/test.js', 'admin-tools/product-delete-storage.mjs']:
                    file = current / name; original = file.read_text(); file.write_text('unreviewed')
                    with self.assertRaisesRegex(AssertionError, 'UNREVIEWED_WEB_FILES'): revert.verify(target, current, [old, new])
                    file.write_text(original)
                file = current / 'server.mjs'; file.write_text('extra-runtime-change')
                with self.assertRaisesRegex(AssertionError, 'RUNTIME_PATCH'): revert.verify(target, current, [old, new])
                file.write_text('exact-theme-runtime')
                file = current / 'button-states/buttons.css'; original = file.read_bytes(); file.write_text('unreviewed-theme')
                with self.assertRaisesRegex(AssertionError, 'ASSET'): revert.verify(target, current, [old, new])
                file.write_bytes(original)
                for layers in [['changed-base', 'only-theme-layer'], ['retained', 'theme', 'unreviewed-extra-layer']]:
                    invalid = copy.deepcopy(new); invalid['RootFS']['Layers'] = layers
                    with self.assertRaisesRegex(AssertionError, 'LAYERS'): revert.verify(target, current, [old, invalid])
                invalid = copy.deepcopy(new); invalid['Config']['Env'] = ['UNREVIEWED=true']
                with self.assertRaisesRegex(AssertionError, 'CONFIGURATION'): revert.verify(target, current, [old, invalid])

    def test_backup_requires_both_exact_fresh_images_and_settings(self):
        before = {'hidi-web': state('web'), 'hidi-api': state('api')}
        with tempfile.TemporaryDirectory() as temp, patch.object(revert, 'evidence', Path(temp)):
            with self.assertRaisesRegex(AssertionError, 'REQUIRED'): revert.require_backups(before)
            originals = {}
            for name, value in before.items():
                originals[name] = {'verified': True, 'originalImage': value['image'], 'digest': value['image'].split('@')[1], 'settingsHash': value['settingsHash']}
                (Path(temp) / (name.removeprefix('hidi-') + '-backup.json')).write_text(json.dumps(originals[name]))
            revert.require_backups(before)
            (Path(temp) / 'api-backup.json').unlink()
            with self.assertRaisesRegex(AssertionError, 'REQUIRED'): revert.require_backups(before)
            (Path(temp) / 'api-backup.json').write_text(json.dumps(originals['hidi-api']))
            for field, value in [('verified', False), ('originalImage', revert.TARGET_WEB), ('digest', 'sha256:' + 'e' * 64), ('settingsHash', 'changed')]:
                altered = copy.deepcopy(originals['hidi-api']); altered[field] = value
                (Path(temp) / 'api-backup.json').write_text(json.dumps(altered))
                with self.assertRaisesRegex(AssertionError, 'MISMATCH'): revert.require_backups(before)

    def test_actual_report_requires_all_engines_widths_and_no_injection_or_writes(self):
        revert.validate_browser_report(report())
        for field, invalid in [('passed', False), ('sourceThemeInjected', True), ('sourceThemeInjected', None), ('liveWrites', 1), ('examinedControls', 0)]:
            altered = report(); altered[field] = invalid
            with self.assertRaises(AssertionError): revert.validate_browser_report(altered)
        altered = report(); altered['results'].pop()
        with self.assertRaisesRegex(AssertionError, 'COVERAGE'): revert.validate_browser_report(altered)
        altered = report(); altered['results'][0]['status'] = 'FAIL'
        with self.assertRaisesRegex(AssertionError, 'FAILURE'): revert.validate_browser_report(altered)

    def setup_apply(self, verify=None, before_change=None, public_change=False):
        temp = tempfile.TemporaryDirectory(); self.addCleanup(temp.cleanup); private = Path(temp.name)
        values = {'hidi-web': state('web'), 'hidi-api': state('api')}; original = copy.deepcopy(values); writes = []
        for name, value in original.items(): (private / (name + '.json')).write_text(json.dumps(value))
        evidence = private / 'evidence'; evidence.mkdir(); (evidence / 'public-before.json').write_text(json.dumps({'stable': 'hash'}))
        (evidence / 'live').mkdir(); (evidence / 'live/report.json').write_text(json.dumps(report()))
        if before_change: before_change(values)
        def write(data, image, suffix):
            writes.append((data['image'], image, suffix)); values['hidi-web'].update({'image': image, 'latest': 'hidi-web--' + suffix, 'ready': 'hidi-web--' + suffix})
        def routes():
            if verify: verify(values)
        contexts = [patch.object(revert, 'private', private), patch.object(revert, 'evidence', evidence), patch.object(revert, 'require_backups'), patch.object(revert, 'require_candidate'), patch.object(revert.cloud, 'app', lambda name: copy.deepcopy(values[name])), patch.object(revert.cloud, 'snapshot', copy.deepcopy), patch.object(revert.cloud, 'write_image', write), patch.object(revert, 'wait_ready', lambda *_: copy.deepcopy(values['hidi-web'])), patch.object(revert.cloud, 'wait_ready', lambda *_: copy.deepcopy(values['hidi-web'])), patch.object(revert, 'verify_live_routes', routes), patch.object(revert, 'public_state', lambda: {'stable': 'changed' if public_change else 'hash'}), patch.object(revert.subprocess, 'run'), patch.dict(os.environ, {'GITHUB_RUN_ID': '123'})]
        for item in contexts: item.start(); self.addCleanup(item.stop)
        return evidence, values, original, writes

    def test_success_only_changes_web_image_and_revision(self):
        evidence, values, original, writes = self.setup_apply()
        revert.apply()
        self.assertEqual(writes, [(revert.OWNED_WEB, revert.TARGET_WEB, 'buttonrevert123')])
        self.assertEqual(values['hidi-api'], original['hidi-api'])
        self.assertEqual(values['hidi-web']['settingsHash'], original['hidi-web']['settingsHash'])
        result = json.loads((evidence / 'after.json').read_text())
        self.assertTrue(result['buttonThemeRemoved']); self.assertTrue(result['adminDeletionPreserved']); self.assertFalse(result['databaseWrites']); self.assertFalse(result['blobWrites'])

    def test_same_image_new_revision_before_apply_blocks_every_write(self):
        def changed(values): values['hidi-web'].update({'latest': 'hidi-web--independent', 'ready': 'hidi-web--independent'})
        _, _, _, writes = self.setup_apply(before_change=changed)
        with self.assertRaisesRegex(AssertionError, 'CONCURRENT'): revert.apply()
        self.assertEqual(writes, [])

    def test_api_change_before_apply_blocks_every_write(self):
        def changed(values): values['hidi-api']['image'] = revert.REGISTRY + '/hidi-api@sha256:' + 'd' * 64
        _, _, _, writes = self.setup_apply(before_change=changed)
        with self.assertRaisesRegex(AssertionError, 'CONCURRENT'): revert.apply()
        self.assertEqual(writes, [])

    def test_public_content_change_before_apply_blocks_every_write(self):
        _, _, _, writes = self.setup_apply(public_change=True)
        with self.assertRaisesRegex(AssertionError, 'PUBLIC_CONTENT'): revert.apply()
        self.assertEqual(writes, [])

    def test_live_failure_restores_only_owned_web_image(self):
        def failed(_): raise RuntimeError('simulated live route failure')
        evidence, values, original, writes = self.setup_apply(verify=failed)
        with self.assertRaisesRegex(RuntimeError, 'route failure'): revert.apply()
        self.assertEqual(len(writes), 2); self.assertEqual(writes[-1][1], revert.OWNED_WEB)
        self.assertEqual(values['hidi-api'], original['hidi-api'])
        self.assertEqual(json.loads((evidence / 'rollback.json').read_text())['webStatus'], 'restored')

    def test_api_drift_restores_owned_web_without_api_write(self):
        def changed(values): values['hidi-api']['image'] = revert.REGISTRY + '/hidi-api@sha256:' + 'd' * 64
        evidence, values, _, writes = self.setup_apply(verify=changed)
        with self.assertRaisesRegex(AssertionError, 'API_STATE_CHANGED'): revert.apply()
        self.assertEqual(len(writes), 2); self.assertEqual(values['hidi-web']['image'], revert.OWNED_WEB)
        result = json.loads((evidence / 'rollback.json').read_text()); self.assertFalse(result['apiUnchanged']); self.assertFalse(result['apiWrites'])

    def test_same_image_independent_revision_is_not_overwritten_on_failure(self):
        def changed(values):
            values['hidi-web'].update({'latest': 'hidi-web--independent', 'ready': 'hidi-web--independent'})
            raise RuntimeError('independent image owner')
        evidence, values, _, writes = self.setup_apply(verify=changed)
        with self.assertRaisesRegex(RuntimeError, 'independent'): revert.apply()
        self.assertEqual(len(writes), 1); self.assertEqual(values['hidi-web']['latest'], 'hidi-web--independent')
        self.assertEqual(json.loads((evidence / 'rollback.json').read_text())['webStatus'], 'not-owned')

    def test_independent_settings_are_not_overwritten_on_failure(self):
        def changed(values):
            values['hidi-web']['settingsHash'] = 'independent-settings'
            raise RuntimeError('independent settings owner')
        evidence, values, _, writes = self.setup_apply(verify=changed)
        with self.assertRaisesRegex(RuntimeError, 'independent'): revert.apply()
        self.assertEqual(len(writes), 1); self.assertEqual(values['hidi-web']['settingsHash'], 'independent-settings')
        self.assertEqual(json.loads((evidence / 'rollback.json').read_text())['webStatus'], 'not-owned')

if __name__ == '__main__': unittest.main()
