"""Offline tests of the actual storage-check helpers; no Azure connection or writes."""
import ast
import copy
import json
import re
from pathlib import Path
import subprocess
import types
import unittest
from unittest.mock import patch

SOURCE = Path(__file__).with_name('azure-check.py')
TREE = ast.parse(SOURCE.read_text())
NAMES = {'azure_resource_missing', 'az', 'live_state_diagnostics', 'owned'}
FUNCTIONS = [node for node in TREE.body if isinstance(node, ast.FunctionDef) and node.name in NAMES]
assert {node.name for node in FUNCTIONS} == NAMES
NS = {'json': json, 're': re, 'subprocess': subprocess}
exec(compile(ast.Module(body=FUNCTIONS, type_ignores=[]), str(SOURCE), 'exec'), NS)


def error(code, message='Fixture'):
    return 'ERROR: Not Found(' + json.dumps({'error': {'code': code, 'message': message}}) + ')'


class StorageCheckTests(unittest.TestCase):
    def test_job_specific_not_found_is_confirmed_absence(self):
        self.assertTrue(NS['azure_resource_missing'](error('ContainerAppsJobNotFound')))

    def test_generic_resource_not_found_is_confirmed_absence(self):
        self.assertTrue(NS['azure_resource_missing'](error('ResourceNotFound')))

    def test_standard_cli_not_found_response(self):
        self.assertTrue(NS['azure_resource_missing']('ERROR: (ContainerAppsJobNotFound) Fixture'))

    def test_authorization_denial_is_never_absence(self):
        self.assertFalse(NS['azure_resource_missing'](error('AuthorizationFailed', 'ContainerAppsJobNotFound ResourceNotFound')))

    def test_unknown_scope_and_transient_errors_fail_closed(self):
        for code in ['ResourceGroupNotFound', 'SubscriptionNotFound', 'Forbidden', 'TooManyRequests', 'InternalServerError']:
            with self.subTest(code=code):
                self.assertFalse(NS['azure_resource_missing'](error(code)))

    def test_unstructured_not_found_text_is_not_enough(self):
        self.assertFalse(NS['azure_resource_missing']('ERROR: failed while looking for ResourceNotFound'))
        self.assertFalse(NS['azure_resource_missing'](''))

    def test_get_with_explicit_absence_permission_accepts_job_deletion(self):
        response = subprocess.CompletedProcess([], 1, '', error('ContainerAppsJobNotFound'))
        with patch.object(subprocess, 'run', return_value=response):
            self.assertIsNone(NS['az'](['rest', '--method', 'get', '--url', 'https://management.azure.com/fixture'], absent=True))

    def test_get_without_absence_permission_still_fails(self):
        response = subprocess.CompletedProcess([], 1, '', error('ContainerAppsJobNotFound'))
        with patch.object(subprocess, 'run', return_value=response):
            with self.assertRaises(RuntimeError):
                NS['az'](['rest', '--method', 'get'])

    def test_write_errors_are_not_suppressed(self):
        response = subprocess.CompletedProcess([], 1, '', error('ResourceNotFound'))
        with patch.object(subprocess, 'run', return_value=response):
            for method in ['put', 'patch', 'delete']:
                with self.subTest(method=method), self.assertRaises(RuntimeError):
                    NS['az'](['rest', '--method', method], absent=True)

    def test_authorization_failure_is_still_raised_by_command_wrapper(self):
        response = subprocess.CompletedProcess([], 1, '', error('AuthorizationFailed'))
        with patch.object(subprocess, 'run', return_value=response):
            with self.assertRaisesRegex(RuntimeError, 'AuthorizationFailed'):
                NS['az'](['rest', '--method', 'get'], absent=True)

    def test_successful_response_is_not_reinterpreted(self):
        response = subprocess.CompletedProcess([], 0, '{"id":"owned-job"}', '')
        with patch.object(subprocess, 'run', return_value=response):
            self.assertEqual(NS['az'](['rest', '--method', 'get'], absent=True), {'id': 'owned-job'})

    def test_drift_diagnostics_do_not_replace_the_captured_reference(self):
        before = {'hidi-api': {'image': 'original', 'latest': 'old', 'ready': 'old', 'settingsHash': 'a', 'mode': 'Single'}}
        current = {'image': 'external-release', 'latest': 'new', 'ready': 'new', 'settingsHash': 'a', 'mode': 'Single'}
        saved = copy.deepcopy(before)
        NS['r'] = types.SimpleNamespace(r=types.SimpleNamespace(cloud=types.SimpleNamespace(app=lambda name: current, snapshot=lambda value: copy.deepcopy(value))))
        result = NS['live_state_diagnostics'](before)
        self.assertFalse(result['hidi-api']['matches'])
        self.assertEqual(result['hidi-api']['changedKeys'], ['image', 'latest', 'ready'])
        self.assertEqual(before, saved)

    def test_job_ownership_guard_still_rejects_other_runs(self):
        NS['expected'] = {'id': '/owned/job'}
        NS['run'] = '123-2'
        NS['report'] = {'image': 'registry/owned@sha256:fixture'}
        value = {'id': '/owned/job', 'tags': {'hidi-photo-release': 'another-run'}, 'properties': {'template': {'containers': [{'image': 'registry/owned@sha256:fixture'}]}}}
        with self.assertRaisesRegex(AssertionError, 'another run'):
            NS['owned'](value)

    def test_concurrent_application_change_still_stops_release(self):
        path = SOURCE.parent.parent / 'photo-upload' / 'release.py'
        tree = ast.parse(path.read_text())
        method = next(node for node in tree.body if isinstance(node, ast.FunctionDef) and node.name == 'unchanged')
        cloud = types.SimpleNamespace(app=lambda name: {'image': 'external-release'}, snapshot=lambda value: value, ready=lambda value: None)
        space = {'cloud': cloud}
        exec(compile(ast.Module(body=[method], type_ignores=[]), str(path), 'exec'), space)
        with self.assertRaisesRegex(AssertionError, 'Concurrent application change: hidi-api'):
            space['unchanged']({'hidi-api': {'image': 'captured-release'}})


if __name__ == '__main__':
    unittest.main(verbosity=2)
