"""No Azure calls: prove post-write failures enter the rollback path."""
import importlib.util
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
from contextlib import ExitStack

temp = tempfile.TemporaryDirectory()
os.environ['RUNNER_TEMP'] = temp.name
spec = importlib.util.spec_from_file_location('page_release', Path(__file__).with_name('release.py'))
release = importlib.util.module_from_spec(spec)
spec.loader.exec_module(release)
os.environ['GITHUB_RUN_ID'] = '12345'
os.environ['GITHUB_RUN_ATTEMPT'] = '1'
os.environ['GITHUB_SHA'] = 'test-source'

class ReleaseTests(unittest.TestCase):
    def test_delivery_must_be_enabled_before_editor_release(self):
        for env in [[],[{'name':'DELHIVERY_SYNC_ENABLED','value':'false'}]]:
            with patch.object(release.photo,'originals',return_value={'hidi-api':{'properties':{'template':{'containers':[{'env':env}]}}}}):
                with self.assertRaisesRegex(AssertionError,'Delivery automation'): release.require_delivery_complete()
        with patch.object(release.photo,'originals',return_value={'hidi-api':{'properties':{'template':{'containers':[{'env':[{'name':'DELHIVERY_SYNC_ENABLED','value':'true'}]}]}}}}):
            release.require_delivery_complete()
    def exercise(self, failure=None):
        before = {'hidi-api': {'image': 'api-original'}, 'hidi-web': {'image': 'web-original', 'settingsHash': 'same'}}
        after = {'image': 'web-candidate', 'settingsHash': 'same'}
        events = []
        def operation(name, result=None):
            def call(*args, **kwargs):
                events.append(name)
                if failure == name:
                    raise RuntimeError('injected ' + name)
                return result
            return call
        with ExitStack() as stack:
            def mock(obj, name, **kwargs): return stack.enter_context(patch.object(obj, name, **kwargs))
            mock(release, 'backups');mock(release, 'require_candidate')
            mock(release.photo, 'states', return_value=before)
            mock(release.photo, 'originals', return_value=before)
            mock(release.photo, 'unchanged')
            mock(release.guard, 'public_snapshot', return_value={'content': 'unchanged'})
            mock(release.guard, 'private_json', side_effect=lambda name: {'mayComplete': True} if name == 'forward-write.json' else {'content': 'unchanged'})
            mock(release.guard, 'write_private');mock(release.guard, 'install_interrupt_handler')
            mock(release.guard, 'conditional_write_image', side_effect=operation('write'))
            mock(release.guard, 'wait_ready', side_effect=operation('ready', after))
            mock(release.cloud, 'snapshot', side_effect=lambda value: value)
            mock(release.guard, 'routes', side_effect=operation('routes'))
            mock(release, 'verify_live', side_effect=operation('browser'))
            rollback = mock(release.guard, 'reconcile_failure', side_effect=operation('rollback', {'passed': True}))
            saved = mock(release, 'save')
            if failure:
                with self.assertRaisesRegex(RuntimeError, 'injected ' + failure): release.apply('web-candidate')
                rollback.assert_called_once_with('web-candidate', before, {'content': 'unchanged'}, {'content': 'unchanged'}, 'pageedit12345a1', True)
                self.assertEqual(events[-2:], [failure, 'rollback'])
                saved.assert_called_once_with('rollback.json', {'passed': True})
            else:
                release.apply('web-candidate');rollback.assert_not_called()
                self.assertEqual(events, ['write', 'ready', 'routes', 'browser'])
                self.assertTrue(saved.call_args.args[1]['passed'])

    def test_success(self): self.exercise()
    def test_ambiguous_write_rolls_back(self): self.exercise('write')
    def test_revision_failure_rolls_back(self): self.exercise('ready')
    def test_live_route_failure_rolls_back(self): self.exercise('routes')
    def test_live_browser_failure_rolls_back(self): self.exercise('browser')
if __name__ == '__main__': unittest.main()
