import importlib.util,tempfile,unittest
from pathlib import Path
HERE=Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location('compact',HERE/'patch-runtime.py');p=importlib.util.module_from_spec(spec);spec.loader.exec_module(p)
class Tests(unittest.TestCase):
 def test_additive_patch_retains_existing_runtime(self):
  for signature in ['html','html, pathname']:
   with tempfile.TemporaryDirectory() as folder:
    base=Path(folder)/'base';overlay=Path(folder)/'overlay';(base/'dist').mkdir(parents=True)
    server='// existing overlays\nfunction injectStorefrontLayerFix('+signature+') {\n  return html;\n}\n'
    html='<html><head><link rel="stylesheet" href="old.css"></head><body>Original</body></html>'
    (base/'server.mjs').write_text(server);(base/'dist/index.html').write_text(html)
    (base/'pricing').mkdir();(base/'pricing/storefront.mjs').write_bytes((HERE.parent/'pricing/storefront.mjs').read_bytes())
    report=p.patch_runtime(base,overlay);self.assertEqual(len(report['allowedFiles']),3)
    self.assertIn('old.css',(overlay/'dist/index.html').read_text());self.assertIn('return html;', (overlay/'server.mjs').read_text())
    self.assertEqual((overlay/'dist'/report['cssAsset']).read_bytes(),p.CSS.read_bytes())
    with self.assertRaises(AssertionError):p.patch_runtime(overlay,Path(folder)/'twice')
 def test_unknown_runtime_rejected(self):
  with tempfile.TemporaryDirectory() as folder:
   base=Path(folder)/'base';(base/'dist').mkdir(parents=True);(base/'server.mjs').write_text('unknown');(base/'dist/index.html').write_text('<head></head>')
   with self.assertRaises(AssertionError):p.patch_runtime(base,Path(folder)/'overlay')
if __name__=='__main__':unittest.main()
