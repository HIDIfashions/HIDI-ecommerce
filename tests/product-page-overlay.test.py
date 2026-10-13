import importlib.util
from pathlib import Path
import tempfile
import unittest
import sys
sys.dont_write_bytecode = True

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('product_page_patch', ROOT / 'deploy/product-page/patch-runtime.py')
patch = importlib.util.module_from_spec(spec)
spec.loader.exec_module(patch)

class EditorOverlay(unittest.TestCase):
    def baseline(self, root):
        (root / 'admin-tools').mkdir(parents=True)
        (root / 'server.mjs').write_text('handleQuickTools(request, response, pathname)')
        handler = (ROOT / 'deploy/admin-tools/handler.mjs').read_text().replace("'product-page.css','product-page.mjs','product-page-model.mjs',", '', 1).replace("['/admin/product-page','product-page.html'],", '', 1)
        handler = handler.replace('const pages=new Map([', "const pages=new Map([['/admin/product-upload','product-upload/page.html'],", 1)
        nav = (ROOT / 'deploy/admin-tools/navigation.js').read_text()
        start = nav.index("    for(const a of document.querySelectorAll('a[href^=\"/admin/products/\"]')){")
        end = nav.index("    if(['/admin/import','/admin/product-bulk'].includes", start)
        nav = nav[:start] + nav[end:]
        nav = nav.replace(patch.TOOL, '', 1).replace('  const tools = [\n', "  const tools = [\n    { key: 'product-upload', label: 'Product Upload', href: '/admin/product-upload', icon: '<path/>', marker: 'hidiProductUpload' },\n", 1)
        (root / 'admin-tools/handler.mjs').write_text(handler)
        (root / 'admin-tools/navigation.js').write_text(nav)
        return handler, nav

    def test_preserves_current_uploader_and_unrelated_bytes(self):
        with tempfile.TemporaryDirectory() as tmp:
            base, overlay = Path(tmp) / 'base', Path(tmp) / 'overlay'
            self.baseline(base)
            report = patch.patch_runtime(base, overlay)
            self.assertEqual(len(report['allowedFiles']), 6)
            self.assertTrue(report['inverseTransformsVerified'])
            self.assertIn('/admin/product-upload', (overlay / 'admin-tools/handler.mjs').read_text())
            self.assertIn("key: 'product-upload'", (overlay / 'admin-tools/navigation.js').read_text())
            self.assertFalse((overlay / 'server.mjs').exists())

    def test_unknown_navigation_anchor_and_repeat_install_are_rejected(self):
        with tempfile.TemporaryDirectory() as tmp:
            base, overlay = Path(tmp) / 'base', Path(tmp) / 'overlay'
            self.baseline(base)
            nav = base / 'admin-tools/navigation.js'
            nav.write_text(nav.read_text().replace('  const tools = [\n', '  const tools = [ '))
            with self.assertRaises(AssertionError): patch.patch_runtime(base, overlay)
            self.assertFalse(overlay.exists())
            nav.write_text(nav.read_text() + '\n// /admin/product-page')
            with self.assertRaises(AssertionError): patch.patch_runtime(base, overlay)

if __name__ == '__main__': unittest.main()
