"""Meaningful failure-boundary checks for the product deletion release."""
import copy
import importlib.util
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('admin_delete_release_test', ROOT / 'deploy/admin-delete/release.py')
release = importlib.util.module_from_spec(spec); spec.loader.exec_module(release)

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
            with patch.object(release, 'private', private), patch.object(release, 'evidence', private / 'evidence'), patch.object(release.cloud, 'app', lambda name: copy.deepcopy(states[name])), patch.object(release.cloud, 'snapshot', copy.deepcopy), patch.object(release.cloud, 'write_image', write), patch.object(release, 'wait_ready', lambda name, *_: copy.deepcopy(states[name])), patch.object(release, 'public_state', lambda: {'unchanged': 'hash'}), patch.object(release, 'verify_live_routes', side_effect=RuntimeError('Simulated verification failure')), patch.dict(os.environ, {'GITHUB_RUN_ID': '123'}):
                with self.assertRaisesRegex(RuntimeError, 'verification failure'):
                    release.apply(image('api', 'b'), image('web', 'b'))
            self.assertEqual(states['hidi-api']['image'], original['hidi-api']['image'])
            report = json.loads((private / 'evidence/rollback.json').read_text())
            self.assertEqual(report['restoredApps'], ['hidi-api']); self.assertEqual(report['failedApps'], ['hidi-web'])
            self.assertEqual(len(writes), 4)

if __name__ == '__main__': unittest.main()
