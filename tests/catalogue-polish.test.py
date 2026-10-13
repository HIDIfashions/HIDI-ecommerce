import importlib.util
from pathlib import Path
import tempfile
import unittest
import sys
sys.dont_write_bytecode = True
ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('polish_patch', ROOT / 'deploy/catalogue-polish/patch-runtime.py')
patch = importlib.util.module_from_spec(spec)
spec.loader.exec_module(patch)

class CataloguePolish(unittest.TestCase):
    def test_wrapper_change_is_reversible_and_css_only(self):
        original = 'const before = 1;\nconst storefrontLayerFix = `\n<style data-hidi-storefront-layer-fix="true">\n.site-header { color: red; }\n</style>`;\nconst after = 2;'
        changed = patch.patch_text(original)
        start = changed.index('\n' + patch.MARKER)
        end = changed.index('</style>', start)
        self.assertEqual(changed[:start] + changed[end:], original)
        self.assertEqual(changed.count('.site-header { color: red; }'), 1)
        self.assertIn('padding-top: 12px !important', changed)
        self.assertIn('display: none !important', changed)

    def test_unknown_or_already_patched_wrapper_is_rejected(self):
        with self.assertRaises(AssertionError): patch.patch_text('const nothing = true;')
        original = 'const storefrontLayerFix = `<style data-hidi-storefront-layer-fix="true"></style>`;'
        with self.assertRaises(AssertionError): patch.patch_text(patch.patch_text(original))
        with self.assertRaises(AssertionError): patch.patch_text(original.replace('data-hidi-storefront-layer-fix', 'unexpected'))

    def test_only_wrapper_is_prepared_and_no_other_runtime_file_changes(self):
        with tempfile.TemporaryDirectory() as tmp:
            base, overlay = Path(tmp) / 'base', Path(tmp) / 'overlay'
            base.mkdir()
            (base / 'server.mjs').write_text('const storefrontLayerFix = `<style data-hidi-storefront-layer-fix="true"></style>`;')
            (base / 'protected.txt').write_text('keep')
            report = patch.patch_runtime(base, overlay)
            self.assertEqual(report['allowedFiles'], ['server.mjs'])
            self.assertEqual((base / 'protected.txt').read_text(), 'keep')
            self.assertFalse(report['deploymentPerformed'])
            self.assertFalse(report['databaseWrites'])

if __name__ == '__main__': unittest.main()
