"""Scope, reversible-patch, mobile-preservation and source/runtime agreement gates."""
import hashlib
import importlib.util
from pathlib import Path
import tempfile
import unittest

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
spec = importlib.util.spec_from_file_location("desktop_patch", HERE / "patch-runtime.py")
patch = importlib.util.module_from_spec(spec)
spec.loader.exec_module(patch)
ORIGINAL = 'const storefrontLayerFix = `<style data-hidi-storefront-layer-fix="true">\n@media(max-width:720px){.mobile{color:red}}\n</style>`;\nconst retained = 123;\n'

class DesktopPatchTests(unittest.TestCase):
    def test_only_reviewed_desktop_rule(self):
        self.assertIn("min-width: 1051px", patch.approved_css())
    def test_source_runtime_exact_agreement(self):
        self.assertEqual((ROOT / "apps/web/app/collections/desktop-option2.css").read_bytes(), (HERE / "desktop-option2.css").read_bytes())
    def test_existing_collection_mobile_css_byte_preserved(self):
        data = (ROOT / "apps/web/components/collection-browser.module.css").read_bytes()
        digest = hashlib.sha1(b"blob " + str(len(data)).encode() + b"\0" + data).hexdigest()
        self.assertEqual(digest, "d22ce1c0f74c4480b8e627e7a31543eb93e17811")
    def test_layout_adds_no_dom(self):
        source = (ROOT / "apps/web/app/collections/layout.tsx").read_text()
        self.assertIn("return <>{children}</>", source)
    def test_inverse_restores_every_live_byte(self):
        updated = patch.patch_text(ORIGINAL)
        addition = "\n" + patch.MARKER + "\n" + patch.approved_css() + "\n"
        self.assertEqual(updated.replace(addition, "", 1), ORIGINAL)
    def test_existing_mobile_rule_retained(self):
        self.assertIn("@media(max-width:720px){.mobile{color:red}}", patch.patch_text(ORIGINAL))
    def test_duplicate_install_refused(self):
        with self.assertRaises(AssertionError):
            patch.patch_text(patch.patch_text(ORIGINAL))
    def test_missing_anchor_refused(self):
        with self.assertRaises(AssertionError):
            patch.patch_text("unrelated runtime")
    def test_multiple_anchors_refused(self):
        with self.assertRaises(AssertionError):
            patch.patch_text(ORIGINAL + ORIGINAL)
    def test_no_javascript_or_image_rule_changes(self):
        css = patch.approved_css()
        for value in ("object-fit", "aspect-ratio", "font-size", "grid-template-columns", "url(", "@import", "${", "`", "!important"):
            self.assertNotIn(value, css)
    def test_only_one_overlay_file_written(self):
        with tempfile.TemporaryDirectory() as folder:
            base, overlay = Path(folder) / "base", Path(folder) / "overlay"
            base.mkdir()
            (base / "server.mjs").write_text(ORIGINAL)
            (base / "untouched.txt").write_text("same")
            report = patch.patch_runtime(base, overlay)
            self.assertEqual(report["allowedFiles"], ["server.mjs"])
            self.assertEqual(sorted(p.name for p in overlay.iterdir()), ["server.mjs"])
            self.assertEqual((base / "server.mjs").read_text(), ORIGINAL)
            self.assertTrue(report["inverseTransformsVerified"])
    def test_existing_overlay_refused(self):
        with tempfile.TemporaryDirectory() as folder:
            base, overlay = Path(folder) / "base", Path(folder) / "overlay"
            base.mkdir(); overlay.mkdir()
            (base / "server.mjs").write_text(ORIGINAL)
            (overlay / "server.mjs").write_text("existing")
            with self.assertRaises(AssertionError):
                patch.patch_runtime(base, overlay)

if __name__ == "__main__":
    unittest.main(verbosity=2)
