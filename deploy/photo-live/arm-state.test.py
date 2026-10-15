"""Offline regression tests for pinned provider-state reads; no Azure access."""
import copy
import importlib.util
from pathlib import Path
import types
import unittest

p = Path(__file__).with_name('arm-state.py')
spec = importlib.util.spec_from_file_location('photo_arm_state_tested', p)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


def fixture():
    calls = []
    value = {
        'id': '/subscriptions/' + module.SUBSCRIPTION + '/resourceGroups/' + module.GROUP + '/providers/Microsoft.App/containerApps/hidi-web',
        'identity': {'type': 'UserAssigned', 'userAssignedIdentities': {'fixture-identity': {}}},
        'tags': {'fixture': 'retained'},
        'properties': {
            'template': {'containers': [{'image': 'original-image', 'env': [{'name': 'FIXTURE_VALUE', 'value': 'keep-exactly'}], 'resources': {'cpu': 1}}], 'volumes': []},
            'configuration': {'activeRevisionsMode': 'Single', 'ingress': {'external': True}},
        },
    }
    def azure(*args):
        calls.append(args)
        return copy.deepcopy(value)
    cloud = types.SimpleNamespace(GROUP=module.GROUP, API_VERSION='2024-03-01', azure=azure,
        snapshot=lambda item: item, ready=lambda item: None, image_patch=lambda *args: args)
    return cloud, calls, value


class ArmStateTests(unittest.TestCase):
    def test_uses_explicit_arm_get_and_pinned_version(self):
        cloud, calls, value = fixture()
        module.install(cloud)
        self.assertEqual(cloud.app('hidi-web'), value)
        self.assertEqual(calls[0], ('rest', '--method', 'get', '--url', 'https://management.azure.com' + value['id'] + '?api-version=2025-07-01'))
        self.assertEqual(cloud.API_VERSION, '2025-07-01')

    def test_existing_snapshot_readiness_and_image_only_patch_rules_are_unchanged(self):
        cloud, calls, value = fixture()
        existing = cloud.snapshot, cloud.ready, cloud.image_patch
        module.install(cloud)
        self.assertEqual(existing, (cloud.snapshot, cloud.ready, cloud.image_patch))

    def test_complete_provider_configuration_is_returned_without_filtering(self):
        cloud, calls, value = fixture()
        module.install(cloud)
        actual = cloud.app('hidi-web')
        self.assertEqual(actual, value)
        self.assertEqual(actual['properties']['template']['containers'][0]['env'], value['properties']['template']['containers'][0]['env'])

    def test_unknown_app_is_rejected_before_command(self):
        cloud, calls, value = fixture()
        module.install(cloud)
        for name in ['another-app', '../hidi-web', 'hidi-web?api-version=other']:
            with self.subTest(name=name), self.assertRaises(ValueError): cloud.app(name)
        self.assertEqual(calls, [])

    def test_wrong_group_is_rejected_before_binding(self):
        cloud, calls, value = fixture()
        cloud.GROUP = 'unrelated-group'
        with self.assertRaises(ValueError): module.install(cloud)
        self.assertEqual(calls, [])

    def test_post_binding_target_or_version_drift_is_rejected(self):
        cloud, calls, value = fixture()
        module.install(cloud)
        cloud.API_VERSION = 'different'
        with self.assertRaises(ValueError): cloud.app('hidi-web')
        cloud.API_VERSION = module.API_VERSION
        cloud.GROUP = 'different'
        with self.assertRaises(ValueError): cloud.app('hidi-web')
        self.assertEqual(calls, [])

    def test_wrong_resource_response_is_rejected(self):
        cloud, calls, value = fixture()
        module.install(cloud)
        with self.assertRaisesRegex(ValueError, 'different Container App'): cloud.app('hidi-api')

    def test_incomplete_response_is_not_accepted(self):
        cloud, calls, value = fixture()
        del value['properties']['configuration']
        module.install(cloud)
        with self.assertRaisesRegex(ValueError, 'incomplete'): cloud.app('hidi-web')

    def test_authorization_failures_are_not_suppressed(self):
        cloud, calls, value = fixture()
        def denied(*args): raise RuntimeError('AuthorizationFailed')
        cloud.azure = denied
        module.install(cloud)
        with self.assertRaisesRegex(RuntimeError, 'AuthorizationFailed'): cloud.app('hidi-web')


if __name__ == '__main__':
    unittest.main(verbosity=2)
