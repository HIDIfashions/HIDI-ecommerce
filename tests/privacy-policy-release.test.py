import copy
import importlib.util
from pathlib import Path
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]

def load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module); return module

patcher = load('patcher', ROOT / 'deploy/privacy-policy/patch-runtime.py')
rollout = load('rollout', ROOT / 'deploy/privacy-policy/rollout.py')
composer = load('composer', ROOT / 'deploy/privacy-policy/compose.py')

class PrivacyReleaseTest(unittest.TestCase):
    def state(self):
        return {'id': '/test', 'identity': {'type': 'UserAssigned'}, 'location': 'centralindia', 'tags': {}, 'properties': {'template': {'revisionSuffix': 'old', 'containers': [{'name': 'web', 'image': 'old-image', 'env': [{'name': 'PRIVATE', 'secretRef': 'kept'}, {'name': 'NORMAL', 'value': 'kept'}]}], 'scale': {'minReplicas': 1}}, 'configuration': {'activeRevisionsMode': 'Single', 'ingress': {'external': True, 'traffic': []}}, 'latestRevisionName': 'rev', 'latestReadyRevisionName': 'rev'}}

    def test_settings_guard_rejects_real_settings_and_secret_changes(self):
        original = self.state(); before = rollout.snapshot(original)
        changed = copy.deepcopy(original); changed['properties']['template']['containers'][0]['image'] = 'candidate'; changed['properties']['template']['revisionSuffix'] = 'new'
        self.assertEqual(before['settingsHash'], rollout.snapshot(changed)['settingsHash'])
        changed['properties']['template']['containers'][0]['env'][0]['value'] = ''
        self.assertEqual(before['settingsHash'], rollout.snapshot(changed)['settingsHash'])
        for value in ['changed-reference', '']:
            other = copy.deepcopy(original); other['properties']['template']['containers'][0]['env'][0]['secretRef'] = value
            self.assertNotEqual(before['settingsHash'], rollout.snapshot(other)['settingsHash'])
        other = copy.deepcopy(original); other['properties']['template']['containers'][0]['env'][1]['value'] = 'changed'
        self.assertNotEqual(before['settingsHash'], rollout.snapshot(other)['settingsHash'])
        other = copy.deepcopy(original); other['properties']['configuration']['ingress']['external'] = False
        self.assertNotEqual(before['settingsHash'], rollout.snapshot(other)['settingsHash'])

    def test_runtime_patch_is_additive_and_refuses_drift_or_double_apply(self):
        source = '\n'.join(anchor for anchor, _ in patcher.HOOKS)
        result = patcher.patch(source)
        self.assertIn('handlePrivacyPolicy', result)
        with self.assertRaises(ValueError): patcher.patch(result)
        with self.assertRaises(AssertionError): patcher.patch(source.replace(patcher.HOOKS[0][0], 'changed'))

    def test_arm_patch_includes_required_retained_location_and_only_image_revision_changes(self):
        original = self.state(); patch = rollout.image_patch(original, 'candidate-image', 'privacy-reviewed')
        self.assertEqual(set(patch), {'location', 'properties'})
        self.assertEqual(patch['location'], original['location'])
        self.assertEqual(set(patch['properties']), {'template'})
        expected = copy.deepcopy(original['properties']['template'])
        expected['containers'][0]['image'] = 'candidate-image'; expected['revisionSuffix'] = 'privacy-reviewed'
        self.assertEqual(patch['properties']['template'], expected)
        self.assertEqual(original['properties']['template']['containers'][0]['image'], 'old-image')

    def test_image_guard_protects_shopping_media_api_dependencies_and_config(self):
        with tempfile.TemporaryDirectory() as work:
            base, candidate = Path(work) / 'base', Path(work) / 'candidate'
            base.mkdir(); candidate.mkdir()
            source = '\n'.join(anchor for anchor, _ in patcher.HOOKS)
            (base / 'server.mjs').write_text(source); (candidate / 'server.mjs').write_text(patcher.patch(source))
            for root in [base, candidate]:
                for name in ['hero-media.mjs', 'dist/index.html', 'apps/web/.next/compiled.js', 'apps/api/dist/untouched.js', 'node_modules/package/file.js']:
                    file = root / name; file.parent.mkdir(parents=True, exist_ok=True); file.write_text('protected bytes')
            (candidate / 'privacy-policy').mkdir()
            for name in composer.FILES: (candidate / 'privacy-policy' / name).write_bytes((ROOT / 'deploy/privacy-policy' / name).read_bytes())
            configs = [{'Config': {'Cmd': ['node', 'server.mjs']}, 'RootFS': {'Layers': ['original']}}, {'Config': {'Cmd': ['node', 'server.mjs']}, 'RootFS': {'Layers': ['original', 'policy']}}]
            self.assertTrue(composer.verify(base, candidate, configs)['passed'])
            protected = candidate / 'dist/index.html'; protected.write_text('unrelated replacement')
            with self.assertRaises(AssertionError): composer.verify(base, candidate, configs)
            protected.write_text('protected bytes'); configs[1]['Config']['Cmd'] = ['node', 'wrong.mjs']
            with self.assertRaises(AssertionError): composer.verify(base, candidate, configs)

if __name__ == '__main__': unittest.main()
