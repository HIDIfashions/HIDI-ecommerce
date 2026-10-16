import importlib.util,tempfile,unittest
from pathlib import Path
HERE=Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location('pricing_patch',HERE/'patch-runtime.py');patch=importlib.util.module_from_spec(spec);spec.loader.exec_module(patch)
class PatchTests(unittest.TestCase):
 def test_normalization_rejects_percentage_and_preserves_other_bytes(self):
  for anchor in ["const value=input??{kind:'NONE'};",'const value = input ?? { kind: "NONE" };']:
   source='before\n'+anchor+'\nafter';result=patch.disable_percent(source)
   self.assertIn('percentage discounts are disabled',result);self.assertTrue(result.startswith('before\n'+anchor));self.assertTrue(result.endswith('\nafter'));self.assertEqual(patch.disable_percent(result),result)
  with self.assertRaises(AssertionError):patch.disable_percent('unknown runtime')
 def test_web_install_is_idempotent_and_keeps_original_wrapper_hooks(self):
  source='\n'.join(['import { createOffersHandler } from "./offers/handler.mjs";','const handleOffers = createOffersHandler({ origin });','  if (await handleOffers(request, response, pathname)) return;','function injectOffers(html, pathname) {','return html;','}'])
  with tempfile.TemporaryDirectory() as directory:
   root=Path(directory);base=root/'base';base.mkdir();(base/'server.mjs').write_text(source)
   result=patch.patch_runtime(base,root/'first');self.assertFalse(result['databaseWrites']);self.assertEqual((base/'server.mjs').read_text(),source)
   patched=(root/'first/server.mjs').read_text();(base/'server.mjs').write_text(patched);patch.patch_runtime(base,root/'second');self.assertEqual((root/'second/server.mjs').read_text(),patched)
if __name__=='__main__':unittest.main()
