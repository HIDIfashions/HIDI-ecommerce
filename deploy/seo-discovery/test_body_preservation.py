import importlib.util
import unittest
from pathlib import Path


def load_module():
    path = Path(__file__).with_name('body-preservation.py')
    spec = importlib.util.spec_from_file_location('seo_body_preservation', path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


body = load_module()


class BodyPreservationTest(unittest.TestCase):
    def test_exact_optional_announcement_is_the_only_home_normalization(self):
        plain = b'<html><head><title>HIDI</title></head><body><main>Shop</main></body></html>'
        announced = plain.replace(b'<body>', b'<body>' + body.ANNOUNCEMENT)
        plain_value, plain_report = body.analyze('/', plain)
        announced_value, announced_report = body.analyze('/', announced)
        self.assertEqual(plain_value, announced_value)
        self.assertEqual(plain_report['announcement']['count'], 0)
        self.assertEqual(announced_report['announcement']['count'], 1)

    def test_changed_or_misplaced_announcement_is_rejected(self):
        changed = body.ANNOUNCEMENT.replace(b'15% off', b'20% off')
        document = b'<html><head></head><body>' + changed + b'<main>Shop</main></body></html>'
        normalized, report = body.analyze('/', document)
        self.assertIn(changed, normalized)
        self.assertEqual(report['announcement']['count'], 0)
        misplaced = b'<html><head></head><body><main>Shop</main>' + body.ANNOUNCEMENT + b'</body></html>'
        with self.assertRaisesRegex(AssertionError, 'immediately after'):
            body.analyze('/', misplaced)

    def test_privacy_body_remains_exact(self):
        document = b'<html><head></head><body><main>Privacy</main></body></html>'
        normalized, report = body.analyze('/privacy', document)
        self.assertEqual(normalized, document.split(b'</head>', 1)[1])
        self.assertEqual(report['body'], report['normalizedBody'])
        with self.assertRaisesRegex(AssertionError, 'unexpected'):
            body.analyze('/privacy', document.replace(b'<body>', b'<body>' + body.ANNOUNCEMENT))

    def test_unrelated_body_change_is_visible(self):
        before = b'<body><main>Shop</main></body>'
        after = b'<body><main>Changed</main></body>'
        difference = body.first_difference(before, after)
        self.assertIsNotNone(difference)
        self.assertIn('Shop', difference['beforeSnippet'])
        self.assertIn('Changed', difference['afterSnippet'])


if __name__ == '__main__':
    unittest.main()
