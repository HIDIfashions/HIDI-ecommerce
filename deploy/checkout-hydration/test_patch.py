import importlib.util,subprocess,tempfile,unittest
from pathlib import Path
HERE=Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location('patch',HERE/'patch-runtime.py');patch=importlib.util.module_from_spec(spec);spec.loader.exec_module(patch)
class PatchTests(unittest.TestCase):
 def test_changes_only_reviewed_pricing_module_and_rejects_unknown_baseline(self):
  with tempfile.TemporaryDirectory() as folder:
   base=Path(folder)/'base';overlay=Path(folder)/'overlay';(base/'pricing').mkdir(parents=True)
   original=subprocess.check_output(['git','show','d22d51b:deploy/pricing/storefront.mjs']).decode().replace('\r\n','\n')
   (base/'pricing/storefront.mjs').write_text(original);(base/'server.mjs').write_text('protected')
   report=patch.patch_runtime(base,overlay)
   self.assertEqual(report['allowedFiles'],['pricing/storefront.mjs']);self.assertEqual((base/'server.mjs').read_text(),'protected')
   self.assertEqual((overlay/'pricing/storefront.mjs').read_text(),(HERE.parent/'pricing/storefront.mjs').read_text())
   self.assertEqual((base/'pricing/storefront.mjs').read_text(),original)
   (base/'pricing/storefront.mjs').write_text(original+'\n// independent pricing change')
   with self.assertRaisesRegex(AssertionError,'baseline changed'):patch.patch_runtime(base,overlay)
if __name__=='__main__':unittest.main()
