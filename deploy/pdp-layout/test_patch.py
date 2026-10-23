import importlib.util
from pathlib import Path
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('patcher', Path(__file__).with_name('patch-runtime.py'))
patcher = importlib.util.module_from_spec(spec)
spec.loader.exec_module(patcher)

class PatchTests(unittest.TestCase):
    def test_exact_inverse_and_guards(self):
        original = 'const unrelated = "keep";\r\nconst storefrontLayerFix = `<style data-hidi-storefront-layer-fix="true">.old{color:red}</style>`;\r\n'
        updated = patcher.patch_text(original)
        css = Path(__file__).with_name('pdp-layout.css').read_text(encoding='utf-8')
        self.assertEqual(updated.replace('\n' + patcher.MARKER + '\n' + css + '\n', '', 1), original)
        for invalid in [updated, '', original + original]:
            with self.assertRaises(AssertionError): patcher.patch_text(invalid)
        with tempfile.TemporaryDirectory() as root:
            base, out = Path(root)/'base', Path(root)/'overlay'
            base.mkdir()
            (base/'server.mjs').write_bytes(original.encode())
            report=patcher.patch_runtime(base,out)
            self.assertTrue(report['inverseTransformVerified'])
            self.assertEqual((base/'server.mjs').read_bytes(),original.encode())
            self.assertEqual((out/'server.mjs').read_bytes(),updated.encode())
            self.assertFalse(report['deploymentPerformed'])
            with self.assertRaises(AssertionError): patcher.patch_runtime(base,out)

if __name__ == '__main__': unittest.main()
