"""Failure boundaries for the web-only button overlay and its rollback."""
import copy
import importlib.util
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('button_states_release_test', ROOT / 'deploy/button-states/release.py')
release = importlib.util.module_from_spec(spec); spec.loader.exec_module(release)

def image(app, marker):
    return release.helpers.REGISTRY + '/hidi-' + app + '@sha256:' + marker * 64

def state(app, marker='a'):
    return {'image': image(app, marker), 'settingsHash': app + '-retained-settings', 'latest': 'hidi-' + app + '--old', 'ready': 'hidi-' + app + '--old', 'mode': 'Single'}

class ReleaseGuards(unittest.TestCase):
    def test_reversible_runtime_hook_rejects_missing_duplicate_and_repeated_anchors(self):
        source = 'import { createHeroMediaHandler } from "./hero-media.mjs";\nfunction injectSeo(html, request, pathname) {\n  return html;\n}\nasync function handle(request,response,pathname){\n  if (await performanceHandler.handle(request, response, pathname)) return;\n}\n'
        candidate = release.runtime_patch(source)
        self.assertIn('injectButtonTheme(html)', candidate)
        self.assertIn('wrapButtonTheme(request, response, pathname)', candidate)
        self.assertIn('handleButtonTheme(request, response, pathname)', candidate)
        for invalid in [source + source, source.replace('injectSeo', 'missingSeo'), candidate]:
            with self.assertRaises(AssertionError): release.runtime_patch(invalid)

    def test_only_exact_repository_digests_and_owned_candidate_tags_are_accepted(self):
        release.immutable(image('web', 'a'))
        for invalid in [release.helpers.REGISTRY + '/hidi-web:mutable', image('api', 'a'), 'unrelated.invalid/hidi-web@sha256:' + 'a' * 64]:
            with self.assertRaises(AssertionError): release.immutable(invalid)
        with patch.dict(os.environ, {'GITHUB_RUN_ID': '123'}):
            release.candidate_tag(release.helpers.REGISTRY + '/hidi-web:button-states-123')
            with self.assertRaises(AssertionError): release.candidate_tag(release.helpers.REGISTRY + '/hidi-web:button-states-other')

    def test_both_verified_backups_are_required_and_tied_to_exact_images_and_settings(self):
        before = {'hidi-web': state('web'), 'hidi-api': state('api')}
        with tempfile.TemporaryDirectory() as temp, patch.object(release, 'evidence', Path(temp)):
            with self.assertRaisesRegex(AssertionError, 'REQUIRED'): release.require_backups(before)
            reports = {}
            for name, value in before.items():
                reports[name] = {'verified': True, 'originalImage': value['image'], 'digest': value['image'].split('@')[1], 'settingsHash': value['settingsHash']}
                (Path(temp) / (name.removeprefix('hidi-') + '-backup.json')).write_text(json.dumps(reports[name]))
            release.require_backups(before)
            for field, value in [('verified', False), ('originalImage', image('api', 'b')), ('digest', 'sha256:' + 'b' * 64), ('settingsHash', 'changed')]:
                altered = copy.deepcopy(reports['hidi-api']); altered[field] = value
                (Path(temp) / 'api-backup.json').write_text(json.dumps(altered))
                with self.assertRaisesRegex(AssertionError, 'MISMATCH'): release.require_backups(before)

    def test_exact_four_file_overlay_preserves_compiled_and_admin_features(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp); base = root / 'base'; candidate = root / 'candidate'
            retained = ['apps/web/server.js', 'dist/index.html', 'admin-tools/handler.mjs', 'admin-tools/navigation.js', 'admin-tools/product-delete-handler.mjs', 'admin-tools/product-delete-storage.mjs', 'hero-media.mjs', 'privacy-policy/handler.mjs']
            for folder in [base, candidate]:
                for name in retained:
                    target = folder / name; target.parent.mkdir(parents=True, exist_ok=True); target.write_text('retained:' + name)
            (base / 'server.mjs').write_text('old-runtime'); (candidate / 'server.mjs').write_text('patched-runtime')
            for name in release.ASSETS:
                target = candidate / 'button-states' / name; target.parent.mkdir(exist_ok=True); target.write_bytes((release.HERE / name).read_bytes())
            config = {'Config': {'Cmd': ['node', 'server.mjs']}, 'RootFS': {'Layers': ['retained']}}
            newer = copy.deepcopy(config); newer['RootFS']['Layers'].append('overlay')
            with patch.object(release, 'runtime_patch', lambda _: 'patched-runtime'):
                self.assertTrue(release.verify(base, candidate, [config, newer])['passed'])
                rogue = candidate / 'apps/web/unreviewed.js'; rogue.write_text('unexpected')
                with self.assertRaisesRegex(AssertionError, 'FILES'): release.verify(base, candidate, [config, newer])
                rogue.unlink()
                preserved = candidate / 'admin-tools/product-delete-storage.mjs'; preserved.write_text('unexpected storage mutation')
                with self.assertRaisesRegex(AssertionError, 'FILES'): release.verify(base, candidate, [config, newer])
                preserved.write_text('retained:admin-tools/product-delete-storage.mjs')
                css = candidate / 'button-states/buttons.css'; css.write_text('unreviewed palette')
                with self.assertRaisesRegex(AssertionError, 'ASSET'): release.verify(base, candidate, [config, newer])
                css.write_bytes((release.HERE / 'buttons.css').read_bytes())
                bad = copy.deepcopy(newer); bad['Config']['Env'] = ['UNREVIEWED=true']
                with self.assertRaisesRegex(AssertionError, 'CONFIGURATION'): release.verify(base, candidate, [config, bad])
                bad = copy.deepcopy(newer); bad['RootFS']['Layers'][0] = 'changed'
                with self.assertRaisesRegex(AssertionError, 'LAYERS'): release.verify(base, candidate, [config, bad])

    def test_tested_image_requires_all_three_engines_and_four_viewports(self):
        with tempfile.TemporaryDirectory() as temp, patch.object(release, 'evidence', Path(temp)), patch.object(release, 'image_id', lambda _: 'sha256:tested'), patch.dict(os.environ, {'GITHUB_RUN_ID': '123', 'GITHUB_SHA': 'source'}):
            tag = release.helpers.REGISTRY + '/hidi-web:button-states-123'
            (Path(temp) / 'web-preservation.json').write_text(json.dumps({'passed': True, 'candidateTag': tag, 'candidateImageId': 'sha256:tested'}))
            target = Path(temp) / 'candidate/report.json'; target.parent.mkdir()
            results = [{'engine': engine, 'width': width, 'height': height, 'status': 'PASS'} for engine in ['chromium', 'firefox', 'webkit'] for width, height in [(320, 568), (390, 844), (844, 390), (1440, 900)]]
            report = {'passed': True, 'examinedControls': 1, 'sourceThemeInjected': False, 'liveWrites': 0, 'results': results}
            target.write_text(json.dumps(report)); release.mark_tested(tag)
            self.assertEqual(json.loads((Path(temp) / 'candidate-regression.json').read_text())['candidateImageId'], 'sha256:tested')
            report['results'] = results[:-1]; target.write_text(json.dumps(report))
            with self.assertRaisesRegex(AssertionError, 'COVERAGE'): release.mark_tested(tag)
            report['results'] = results; report['passed'] = False; target.write_text(json.dumps(report))
            with self.assertRaisesRegex(AssertionError, 'REGRESSION'): release.mark_tested(tag)
            report['passed'] = True
            for field, invalid in [('sourceThemeInjected', True), ('sourceThemeInjected', None), ('liveWrites', 1)]:
                altered = copy.deepcopy(report); altered[field] = invalid; target.write_text(json.dumps(altered))
                with self.assertRaisesRegex(AssertionError, 'ACTUAL_CANDIDATE'): release.mark_tested(tag)
            altered = copy.deepcopy(report); altered['results'][0]['status'] = 'FAIL'; target.write_text(json.dumps(altered))
            with self.assertRaisesRegex(AssertionError, 'REGRESSION_FAILURE'): release.mark_tested(tag)

    def run_apply(self, verify=None, api_before=None):
        temp = tempfile.TemporaryDirectory(); self.addCleanup(temp.cleanup); private = Path(temp.name)
        values = {'hidi-web': state('web'), 'hidi-api': state('api')}; original = copy.deepcopy(values); writes = []
        for name, value in values.items(): (private / (name + '.json')).write_text(json.dumps(value))
        if api_before: values['hidi-api'].update(api_before)
        def write(data, target, suffix):
            name = 'hidi-web' if data['image'].startswith(release.helpers.REGISTRY + '/hidi-web@') else 'hidi-api'
            writes.append((name, target)); values[name].update({'image': target, 'latest': name + '--' + suffix, 'ready': name + '--' + suffix})
        def routes():
            if verify: verify(values)
        context = [patch.object(release, 'private', private), patch.object(release, 'evidence', private / 'evidence'), patch.object(release, 'require_backups'), patch.object(release, 'require_candidate'), patch.object(release.cloud, 'app', lambda name: copy.deepcopy(values[name])), patch.object(release.cloud, 'snapshot', copy.deepcopy), patch.object(release.cloud, 'write_image', write), patch.object(release, 'wait_ready', lambda *_: copy.deepcopy(values['hidi-web'])), patch.object(release.cloud, 'wait_ready', lambda *_: copy.deepcopy(values['hidi-web'])), patch.object(release, 'public_state', lambda: {'stable': 'hash'}), patch.object(release, 'verify_live_routes', routes), patch.object(release.subprocess, 'run'), patch.dict(os.environ, {'GITHUB_RUN_ID': '123'})]
        for item in context: item.start(); self.addCleanup(item.stop)
        return private, values, original, writes

    def test_success_writes_only_web_and_keeps_api_snapshot_exact(self):
        private, values, original, writes = self.run_apply()
        release.apply(image('web', 'b'))
        self.assertEqual(writes, [('hidi-web', image('web', 'b'))])
        self.assertEqual(values['hidi-api'], original['hidi-api'])
        report = json.loads((private / 'evidence/after.json').read_text())
        self.assertTrue(report['apiUnchanged']); self.assertFalse(report['databaseWrites']); self.assertFalse(report['blobWrites'])

    def test_api_drift_before_rollout_prevents_all_writes(self):
        _, _, _, writes = self.run_apply(api_before={'image': image('api', 'c')})
        with self.assertRaisesRegex(AssertionError, 'CONCURRENT'): release.apply(image('web', 'b'))
        self.assertEqual(writes, [])

    def test_route_failure_restores_only_owned_web_image(self):
        def fail(_): raise RuntimeError('simulated route verification failure')
        private, values, original, writes = self.run_apply(verify=fail)
        with self.assertRaisesRegex(RuntimeError, 'route verification'): release.apply(image('web', 'b'))
        self.assertEqual(writes, [('hidi-web', image('web', 'b')), ('hidi-web', original['hidi-web']['image'])])
        self.assertEqual(values['hidi-api'], original['hidi-api'])
        self.assertEqual(json.loads((private / 'evidence/rollback.json').read_text())['webStatus'], 'restored')

    def test_api_drift_does_not_prevent_restoration_or_cause_api_write(self):
        def drift(values): values['hidi-api']['image'] = image('api', 'c')
        private, values, original, writes = self.run_apply(verify=drift)
        with self.assertRaisesRegex(AssertionError, 'API_STATE_CHANGED'): release.apply(image('web', 'b'))
        self.assertTrue(all(name == 'hidi-web' for name, _ in writes)); self.assertEqual(values['hidi-web']['image'], original['hidi-web']['image'])
        report = json.loads((private / 'evidence/rollback.json').read_text())
        self.assertFalse(report['apiUnchanged']); self.assertFalse(report['apiWrites'])

    def test_independent_web_image_change_is_not_overwritten_by_rollback(self):
        def drift(values): values['hidi-web']['image'] = image('web', 'c'); raise RuntimeError('independent web change')
        private, values, _, writes = self.run_apply(verify=drift)
        with self.assertRaisesRegex(RuntimeError, 'independent'): release.apply(image('web', 'b'))
        self.assertEqual(len(writes), 1); self.assertEqual(values['hidi-web']['image'], image('web', 'c'))
        self.assertEqual(json.loads((private / 'evidence/rollback.json').read_text())['webStatus'], 'not-owned')

    def test_independent_web_settings_change_is_not_overwritten_by_rollback(self):
        def drift(values): values['hidi-web']['settingsHash'] = 'changed'; raise RuntimeError('independent settings change')
        private, values, _, writes = self.run_apply(verify=drift)
        with self.assertRaisesRegex(RuntimeError, 'independent'): release.apply(image('web', 'b'))
        self.assertEqual(len(writes), 1); self.assertEqual(values['hidi-web']['settingsHash'], 'changed')
        self.assertEqual(json.loads((private / 'evidence/rollback.json').read_text())['webStatus'], 'not-owned')

if __name__ == '__main__': unittest.main()
