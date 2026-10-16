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
        html = ('<html><script type="module" src="./assets/' + Path(landing.BASE_BUNDLE).name
                + '"></script><style>body{color:#591d20}</style></html>').encode()
        (base / 'dist/index.html').write_bytes(html)
        return source, html

    def test_only_two_links_change_and_old_asset_is_retained(self):
        with tempfile.TemporaryDirectory() as folder:
            base, overlay = Path(folder) / 'base', Path(folder) / 'overlay'
            source, html = self.fixture(base)
            inactive = base / 'dist/assets/index-BQ9NoW0w.js'
            inactive.write_bytes(b'untouched historical landing bundle')
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
            self.assertEqual((overlay / 'dist/index.html').read_bytes(), html.replace(Path(landing.BASE_BUNDLE).name.encode(), Path(destination).name.encode()))
            self.assertEqual(inactive.read_bytes(), b'untouched historical landing bundle')
            self.assertFalse((overlay / 'dist/assets/index-BQ9NoW0w.js').exists())
            self.assertEqual(report['activeModuleSource'], './assets/' + Path(landing.BASE_BUNDLE).name)

    def test_root_relative_active_bundle_preserves_its_reference_prefix(self):
        with tempfile.TemporaryDirectory() as folder:
            base, overlay = Path(folder) / 'base', Path(folder) / 'overlay'
            source, html = self.fixture(base)
            html = html.replace(b'./assets/', b'/assets/')
            (base / 'dist/index.html').write_bytes(html)
            with patch.object(landing, 'BASE_SHA256', hashlib.sha256(source).hexdigest()):
                report = landing.patch_landing(base, overlay)
            destination = report['renamedAssets'][landing.BASE_BUNDLE]
            self.assertEqual((overlay / 'dist/index.html').read_bytes(), html.replace(Path(landing.BASE_BUNDLE).name.encode(), Path(destination).name.encode()))
            self.assertEqual(report['activeModuleSource'], '/assets/' + Path(landing.BASE_BUNDLE).name)

    def test_inactive_verified_asset_cannot_replace_a_different_active_bundle(self):
        with tempfile.TemporaryDirectory() as folder:
            base, overlay = Path(folder) / 'base', Path(folder) / 'overlay'
            source, html = self.fixture(base)
            inactive = base / 'dist/assets/index-BQ9NoW0w.js'
            inactive.write_bytes(b'retained historical bundle')
            html = html.replace(Path(landing.BASE_BUNDLE).name.encode(), inactive.name.encode())
            (base / 'dist/index.html').write_bytes(html)
            with patch.object(landing, 'BASE_SHA256', hashlib.sha256(source).hexdigest()):
                with self.assertRaisesRegex(AssertionError, 'Active landing module'):
                    landing.patch_landing(base, overlay)
            self.assertFalse(overlay.exists())
            self.assertEqual((base / landing.BASE_BUNDLE).read_bytes(), source)
            self.assertEqual(inactive.read_bytes(), b'retained historical bundle')

    def test_multiple_module_scripts_fail_before_any_overlay_write(self):
        with tempfile.TemporaryDirectory() as folder:
            base, overlay = Path(folder) / 'base', Path(folder) / 'overlay'
            source, html = self.fixture(base)
            (base / 'dist/index.html').write_bytes(html + b'<script type="module" src="/assets/independent.js"></script>')
            with patch.object(landing, 'BASE_SHA256', hashlib.sha256(source).hexdigest()):
                with self.assertRaisesRegex(AssertionError, 'exactly one active module'):
                    landing.patch_landing(base, overlay)
            self.assertFalse(overlay.exists())

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
