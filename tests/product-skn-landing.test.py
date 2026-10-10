import hashlib
import importlib.util
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("skn_landing_patch", ROOT / "deploy/product-skn/patch-landing.py")
landing = importlib.util.module_from_spec(spec)
spec.loader.exec_module(landing)


class LandingPatchTests(unittest.TestCase):
    def fixture(self, base):
        source = ('className:"ananya-section-heading",children:"Ananya\'s Pick";'
                  + landing.CTA_BEFORE + ';' + landing.MENU_BEFORE + ';'
                  + landing.BANNER_CTA + ';const untouched={image:"original.webp",style:{color:"#591d20"}};').encode()
        target = base / landing.BASE_BUNDLE
        target.parent.mkdir(parents=True)
        target.write_bytes(source)
        html = b'<html><script type="module" src="./assets/index-BQ9NoW0w.js"></script><style>body{color:#591d20}</style></html>'
        (base / 'dist/index.html').write_bytes(html)
        return source, html

    def test_only_two_links_change_and_old_asset_is_retained(self):
        with tempfile.TemporaryDirectory() as folder:
            base, overlay = Path(folder) / 'base', Path(folder) / 'overlay'
            source, html = self.fixture(base)
            with patch.object(landing, 'BASE_SHA256', hashlib.sha256(source).hexdigest()):
                report = landing.patch_landing(base, overlay)
            self.assertTrue(report['passed'])
            self.assertEqual(len(report['allowedFiles']), 2)
            destination = report['renamedAssets'][landing.BASE_BUNDLE]
            new = (overlay / destination).read_bytes()
            self.assertIn(hashlib.sha256(new).hexdigest()[:16], destination)
            self.assertEqual(new.count(b'href:"/collections/ananyas-pick"'), 2)
            self.assertIn(landing.BANNER_CTA.encode(), new)
            self.assertIn(b'const untouched={image:"original.webp",style:{color:"#591d20"}};', new)
            self.assertEqual((base / landing.BASE_BUNDLE).read_bytes(), source)
            self.assertEqual((base / 'dist/index.html').read_bytes(), html)
            self.assertFalse((overlay / landing.BASE_BUNDLE).exists())
            self.assertEqual((overlay / 'dist/index.html').read_bytes(), html.replace(b'index-BQ9NoW0w.js', Path(destination).name.encode()))

    def test_independently_changed_bundle_fails_before_any_overlay_write(self):
        with tempfile.TemporaryDirectory() as folder:
            base, overlay = Path(folder) / 'base', Path(folder) / 'overlay'
            source, _ = self.fixture(base)
            with self.assertRaisesRegex(AssertionError, 'differs'):
                landing.patch_landing(base, overlay)
            self.assertFalse(overlay.exists())
            self.assertEqual((base / landing.BASE_BUNDLE).read_bytes(), source)

    def test_invalid_reference_fails_without_a_partial_overlay(self):
        with tempfile.TemporaryDirectory() as folder:
            base, overlay = Path(folder) / 'base', Path(folder) / 'overlay'
            source, _ = self.fixture(base)
            (base / 'dist/index.html').write_text('<script src="/assets/independent.js"></script>')
            with patch.object(landing, 'BASE_SHA256', hashlib.sha256(source).hexdigest()):
                with self.assertRaisesRegex(AssertionError, 'reference'):
                    landing.patch_landing(base, overlay)
            self.assertFalse(overlay.exists())

    def test_context_and_unique_anchors_are_required(self):
        for text in [landing.CTA_BEFORE + ';' + landing.MENU_BEFORE + ';' + landing.BANNER_CTA,
                     'className:"ananya-section-heading",children:"Ananya\'s Pick";' + landing.CTA_BEFORE * 2 + landing.MENU_BEFORE + landing.BANNER_CTA]:
            source = text.encode()
            with patch.object(landing, 'BASE_SHA256', hashlib.sha256(source).hexdigest()):
                with self.assertRaises(AssertionError):
                    landing.patch_bundle(source)


if __name__ == '__main__':
    unittest.main()
