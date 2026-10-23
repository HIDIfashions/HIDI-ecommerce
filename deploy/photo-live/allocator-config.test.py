import importlib.util
from copy import deepcopy
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location('allocator_config', Path(__file__).with_name('allocator-config.py'))
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)


class AllocatorConfigurationTests(unittest.TestCase):
    def setUp(self):
        self.base = {'Id': 'base', 'Config': {'Env': ['PATH=/usr/bin', 'NODE_ENV=production'], 'Cmd': ['node', 'server.mjs'], 'Entrypoint': None, 'User': 'node', 'WorkingDir': '/app'}, 'RootFS': {'Layers': ['base']}}
        self.candidate = deepcopy(self.base)
        self.candidate['Id'] = 'candidate'
        self.candidate['RootFS']['Layers'].append('photo-overlay')
        self.candidate['Config']['Env'].append('MALLOC_ARENA_MAX=2')

    def test_exact_reviewed_addition_preserves_inputs(self):
        inputs = [self.base, self.candidate]
        original = deepcopy(inputs)
        configs, evidence = m.preservation_configs(inputs)
        self.assertEqual(inputs, original)
        self.assertEqual(configs[0]['Config'], configs[1]['Config'])
        self.assertIs(configs[1], self.candidate)
        self.assertEqual(evidence['before'], None)
        self.assertEqual(evidence['after'], '2')

    def test_existing_correct_policy_is_idempotent(self):
        self.base['Config']['Env'].append('MALLOC_ARENA_MAX=2')
        _, evidence = m.preservation_configs([self.base, self.candidate])
        self.assertEqual(evidence['before'], '2')

    def test_rejects_wrong_missing_or_duplicate_allocator(self):
        for additions in [[], ['MALLOC_ARENA_MAX=4'], ['MALLOC_ARENA_MAX=2', 'MALLOC_ARENA_MAX=2']]:
            with self.subTest(additions=additions):
                changed = deepcopy(self.candidate)
                changed['Config']['Env'] = self.base['Config']['Env'] + additions
                with self.assertRaises(AssertionError):
                    m.preservation_configs([self.base, changed])

    def test_rejects_every_unrelated_config_change(self):
        for key, value in [('Cmd', ['node', 'other.mjs']), ('Entrypoint', ['sh']), ('User', 'root'), ('WorkingDir', '/tmp'), ('ExposedPorts', {'9999/tcp': {}})]:
            with self.subTest(key=key):
                changed = deepcopy(self.candidate)
                changed['Config'][key] = value
                with self.assertRaises(AssertionError):
                    m.preservation_configs([self.base, changed])

    def test_rejects_changed_removed_or_added_unrelated_environment(self):
        for entries in [['PATH=/usr/bin', 'NODE_ENV=development'], ['PATH=/usr/bin'], ['PATH=/usr/bin', 'NODE_ENV=production', 'UNREVIEWED=1']]:
            with self.subTest(entries=entries):
                changed = deepcopy(self.candidate)
                changed['Config']['Env'] = entries + ['MALLOC_ARENA_MAX=2']
                with self.assertRaises(AssertionError):
                    m.preservation_configs([self.base, changed])

    def test_rejects_unexpected_baseline_policy(self):
        self.base['Config']['Env'].append('MALLOC_ARENA_MAX=4')
        with self.assertRaises(AssertionError):
            m.preservation_configs([self.base, self.candidate])

    def test_runtime_override_must_match_the_tested_value(self):
        m.verify_app_override([])
        m.verify_app_override([{'name': 'OTHER', 'value': 'x'}, {'name': m.NAME, 'value': '2'}])
        for entries in [[{'name': m.NAME, 'value': '4'}], [{'name': m.NAME, 'secretRef': 'hidden'}], [{'name': m.NAME, 'value': '2'}, {'name': m.NAME, 'value': '2'}]]:
            with self.subTest(entries=entries), self.assertRaises(AssertionError):
                m.verify_app_override(entries)


if __name__ == '__main__':
    unittest.main()
