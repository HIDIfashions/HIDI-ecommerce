import tempfile, time, unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import Mock, patch
import immutable_image_promote as promotion
from inspect_uploaded_photos import validate_photos, PROBE, job_resource, cleanup_job


class PromotionSafetyTests(unittest.TestCase):
    def fake(self, deadline=None):
        guard = SimpleNamespace(install_interrupt_handler=Mock(), private_json=Mock(return_value={'deadline': time.time() + 300 if deadline is None else deadline}))
        return SimpleNamespace(r=SimpleNamespace(guard=guard), P=Path(tempfile.gettempdir()), E=Path(tempfile.gettempdir()) / 'nonexistent-hidi-smoke-evidence')

    def test_manual_failure_starts_recovery_before_health_checks(self):
        with patch.object(promotion, 'control', return_value={'action': 'rollback', 'reason': 'upload failed'}), patch.object(promotion, 'recover') as recover, patch.object(promotion, 'live_checks') as health:
            with self.assertRaisesRegex(AssertionError, 'Operator reported'):
                promotion.monitor(self.fake())
            recover.assert_called_once(); health.assert_not_called()

    def test_expired_manual_window_rolls_back(self):
        with patch.object(promotion, 'recover') as recover:
            with self.assertRaisesRegex(AssertionError, 'deadline expired'):
                promotion.monitor(self.fake(deadline=0))
            recover.assert_called_once()

    def test_health_failure_rolls_back(self):
        with patch.object(promotion, 'control', return_value=None), patch.object(promotion, 'recover') as recover, patch.object(promotion, 'live_checks', side_effect=AssertionError('probe failed')):
            with self.assertRaisesRegex(AssertionError, 'probe failed'):
                promotion.monitor(self.fake())
            recover.assert_called_once()

    def test_incomplete_smoke_cannot_finish_release(self):
        with patch.object(promotion, 'control', return_value={'action': 'complete', 'checks': {}}), patch.object(promotion, 'recover') as recover, patch.object(promotion, 'live_checks'):
            with self.assertRaisesRegex(AssertionError, 'All manual smoke'):
                promotion.monitor(self.fake())
            recover.assert_called_once()

    def test_unrelated_control_cannot_authorize_release(self):
        promotion.self_test()

    def test_photo_scope_and_size_requirements(self):
        photos=[{'key':'products/variants/approved/normal.jpg','sha256':'a'*64,'bytes':1000000},{'key':'products/variants/approved/large.jpg','sha256':'b'*64,'bytes':45*1024*1024}]
        validate_photos(photos)
        for bad in [[], [photos[0],photos[0]], [{**photos[0], 'key':'../private/file'},photos[1]], [photos[0],{**photos[1],'bytes':1000000}]]:
            with self.assertRaises(AssertionError): validate_photos(bad)

    def test_job_address_accepts_arm_casing_but_rejects_wrong_scope(self):
        app='/subscriptions/91d9572d-0f0b-47fe-802d-0eef36d7c719/resourceGroups/rg-hidi-prod/providers/Microsoft.App/containerApps/hidi-web'
        expected='/subscriptions/91d9572d-0f0b-47fe-802d-0eef36d7c719/resourceGroups/rg-hidi-prod/providers/Microsoft.App/jobs/image-smoke-123-1'
        for value in [app, app.lower(), app.upper()]:
            self.assertEqual(job_resource(value,'image-smoke-123-1').lower(),expected.lower())
        for value in [app.replace('hidi-web','hidi-api'),app.replace('rg-hidi-prod','rg-other'),app.replace('91d9572d','00000000'),app+'/jobs/child']:
            with self.assertRaises(AssertionError):job_resource(value,'image-smoke-123-1')

    def test_failed_creation_cleanup_confirms_absence_without_get_or_delete(self):
        cloud=SimpleNamespace(azure=Mock(return_value=[]));owned=Mock()
        self.assertTrue(cleanup_job(cloud,'image-smoke-123-1','url',owned))
        cloud.azure.assert_called_once_with('containerapp','job','list','-g','rg-hidi-prod','--query','[].name');owned.assert_not_called()

    def test_cleanup_authorization_error_is_not_absence(self):
        cloud=SimpleNamespace(azure=Mock(side_effect=RuntimeError('Forbidden')))
        with self.assertRaisesRegex(RuntimeError,'Forbidden'):cleanup_job(cloud,'image-smoke-123-1','url',Mock())

    def test_cleanup_refuses_job_not_owned_by_this_run(self):
        cloud=SimpleNamespace(azure=Mock(side_effect=[['image-smoke-123-1'],{'tags':{}}]))
        with self.assertRaisesRegex(AssertionError,'ownership'):
            cleanup_job(cloud,'image-smoke-123-1','url',Mock(side_effect=AssertionError('ownership')))
        self.assertEqual(cloud.azure.call_count,2)

    def test_storage_only_evidence_cannot_finish_live_release(self):
        with tempfile.TemporaryDirectory() as directory:
            r=self.fake();r.E=Path(directory)
            (r.E/'uploaded-photo-storage.json').write_text('{}')
            r.read=Mock(return_value={'passed':True,'sourceSha':promotion.SOURCE,'image':promotion.WEB,'normalAndLargeVerified':True,'validationJobRemoved':True,'persistedServingVerified':False})
            command={'action':'complete','checks':{name:'PASS' for name in promotion.CHECKS}}
            with patch.object(promotion,'control',return_value=command),patch.object(promotion,'recover') as recover,patch.object(promotion,'live_checks'):
                with self.assertRaisesRegex(AssertionError,'Live persisted serving'):
                    promotion.monitor(r)
                recover.assert_called_once()


if __name__ == '__main__':
    if '--write-probe' in __import__('sys').argv:
        Path(__import__('sys').argv[-1]).write_text(PROBE)
    else:
        unittest.main()
