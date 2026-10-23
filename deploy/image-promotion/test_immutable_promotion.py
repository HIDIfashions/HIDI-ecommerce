import tempfile, time, unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import Mock, patch
import immutable_image_promote as promotion
from inspect_uploaded_photos import validate_photos, PROBE


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


if __name__ == '__main__':
    if '--write-probe' in __import__('sys').argv:
        Path(__import__('sys').argv[-1]).write_text(PROBE)
    else:
        unittest.main()
