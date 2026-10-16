import copy
import importlib.util
import os
from pathlib import Path
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('media_repair', Path(__file__).resolve().parents[1] / 'deploy/media-upload-config/repair.py')
repair = importlib.util.module_from_spec(spec)
spec.loader.exec_module(repair)


def app():
    return {'id': '/fixture/web', 'location': 'centralindia', 'identity': {'type': 'UserAssigned', 'userAssignedIdentities': {'fixture-id': {}}},
        'tags': {'purpose': 'fixture'}, 'properties': {'latestRevisionName': 'hidi-web--original', 'latestReadyRevisionName': 'hidi-web--original',
        'managedEnvironmentId': 'fixture-environment', 'workloadProfileName': 'Consumption',
        'configuration': {'activeRevisionsMode': 'Single', 'secrets': [{'name': 'retained-key'}],
            'ingress': {'fqdn': 'fixture.azurecontainerapps.io', 'customDomains': [{'name': 'thidigk.thehidi.com', 'bindingType': 'SniEnabled', 'certificateId': 'retained-cert'}]}},
        'template': {'revisionSuffix': 'original', 'scale': {'minReplicas': 1, 'maxReplicas': 6}, 'volumes': [],
            'containers': [{'name': 'web', 'image': 'acrhidiprod0927.azurecr.io/hidi-web@sha256:' + '1' * 64,
                'resources': {'cpu': 1, 'memory': '2Gi'}, 'probes': [{'type': 'Readiness'}],
                'env': [{'name': 'SITE_URL', 'value': 'https://thidigk.thehidi.com'}, {'name': 'MEDIA_PUBLIC_BASE_URL', 'value': '/media'},
                    {'name': 'ADMIN_SECRET', 'secretRef': 'retained-key'}, {'name': 'API_URL', 'value': 'http://internal-api'}]}]}}}


def runtime():
    return {'readOnly': True, 'databaseWrites': False, 'mediaProviderAzure': True, 'accountConfigured': True,
        'accountMatchesCapture': True, 'productContainerAccessible': True, 'mediaBaseStartsHttps': False,
        'siteUrl': 'https://thidigk.thehidi.com'}


class MediaConfigGuards(unittest.TestCase):
    def test_only_media_setting_changes_and_input_is_preserved(self):
        data, before = app(), app()
        changed, target, old = repair.prepare_change(data, runtime())
        self.assertEqual(data, before)
        self.assertEqual(target, 'https://thidigk.thehidi.com/media')
        self.assertEqual(old['value'], '/media')
        self.assertEqual(repair.env(changed)['ADMIN_SECRET'], repair.env(data)['ADMIN_SECRET'])
        changed['properties']['template']['containers'][0]['env'] = data['properties']['template']['containers'][0]['env']
        self.assertEqual(changed, data)

    def test_wrong_account_or_unavailable_storage_cannot_write_configuration(self):
        for key in ('accountMatchesCapture', 'productContainerAccessible', 'mediaProviderAzure'):
            report = runtime(); report[key] = False
            with self.assertRaises(AssertionError): repair.prepare_change(app(), report)

    def test_unbound_site_cannot_redirect_new_product_images(self):
        report = runtime(); report['siteUrl'] = 'https://hidiindia.com'
        data = app(); repair.env(data)['SITE_URL']['value'] = 'https://hidiindia.com'
        with self.assertRaisesRegex(AssertionError, 'existing HTTPS app binding'): repair.prepare_change(data, report)

    def test_runtime_capture_mismatch_and_duplicate_env_are_refused(self):
        data = app(); repair.env(data)['SITE_URL']['value'] = 'https://other.thehidi.com'
        with self.assertRaisesRegex(AssertionError, 'fresh app capture'): repair.prepare_change(data, runtime())
        data = app(); data['properties']['template']['containers'][0]['env'].append({'name': 'MEDIA_PUBLIC_BASE_URL', 'value': 'duplicate'})
        with self.assertRaisesRegex(AssertionError, 'Duplicate'): repair.prepare_change(data, runtime())

    def test_valid_different_media_origin_is_not_overridden(self):
        report = runtime(); report.update(mediaBaseStartsHttps=True, mediaBaseSafeUrl='https://assets.thehidi.com/media')
        with self.assertRaisesRegex(AssertionError, 'review before overriding'): repair.prepare_change(app(), report)

    def test_http_site_is_rejected(self):
        report = runtime(); report['siteUrl'] = 'http://thidigk.thehidi.com'
        with self.assertRaisesRegex(AssertionError, 'HTTPS origin'): repair.prepare_change(app(), report)

    def test_concurrent_app_change_is_not_overwritten(self):
        data = app(); current = copy.deepcopy(data)
        repair.env(current)['API_URL']['value'] = 'http://independent-api'
        with patch.object(repair.cloud, 'app', return_value=current):
            with self.assertRaisesRegex(AssertionError, 'Concurrent application change'): repair.unchanged({'hidi-web': data})

    def test_same_settings_in_an_independent_revision_are_not_rolled_back(self):
        data = app(); changed, _, _ = repair.prepare_change(data, runtime())
        changed['properties']['latestRevisionName'] = changed['properties']['latestReadyRevisionName'] = 'hidi-web--independent'
        expected = repair.cloud.snapshot(changed)
        with patch.object(repair.cloud, 'app', return_value=changed), patch.object(repair.cloud, 'write_image') as write:
            self.assertEqual(repair.rollback_if_owned({'hidi-web': data}, expected, 'mediaconfig123456'), 'independent-change-not-overwritten')
            write.assert_not_called()

    def test_owned_failed_setting_is_restored_with_all_old_settings(self):
        data = app(); changed, _, _ = repair.prepare_change(data, runtime())
        changed['properties']['latestRevisionName'] = changed['properties']['latestReadyRevisionName'] = 'hidi-web--mediaconfig123456'
        with patch.dict(os.environ, {'GITHUB_RUN_ID': '123456'}), patch.object(repair.cloud, 'app', return_value=changed), patch.object(repair.cloud, 'write_image') as write, patch.object(repair, 'wait_ready'):
            self.assertEqual(repair.rollback_if_owned({'hidi-web': data}, repair.cloud.snapshot(changed), 'mediaconfig123456'), 'owned-setting-restored')
            self.assertEqual(write.call_args.args[0], data)
            self.assertEqual(write.call_args.args[1], repair.cloud.snapshot(data)['image'])


if __name__ == '__main__': unittest.main()
