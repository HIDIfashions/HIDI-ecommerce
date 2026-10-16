import importlib.util,tempfile,unittest
from pathlib import Path
HERE=Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location('pricing_patch',HERE/'patch-runtime.py');patch=importlib.util.module_from_spec(spec);spec.loader.exec_module(patch)
class PatchTests(unittest.TestCase):
 def test_retained_checkout_gets_the_quote_method_expected_by_controller(self):
  with tempfile.TemporaryDirectory() as directory:
   root=Path(directory);base=root/'base';folder=base/'apps/api/dist/checkout';folder.mkdir(parents=True)
   (folder/'offers-engine.mjs').write_text("export const normalizedChoice=input=>{const value=input??{kind:'NONE'};};")
   original='class CheckoutService { async prepare(){return "retained";} }'
   (folder/'checkout.service.js').write_text(original)
   result=patch.patch_runtime(base,root/'first','api');self.assertIn('apps/api/dist/checkout/checkout.service.js',result['allowedFiles'])
   updated=(root/'first/apps/api/dist/checkout/checkout.service.js').read_text();self.assertIn('quoteOffers(input, auth = null)',updated);self.assertIn('async prepare(){return "retained";}',updated);self.assertEqual((folder/'checkout.service.js').read_text(),original)
 def test_normalization_rejects_percentage_and_preserves_other_bytes(self):
  for anchor in ["const value=input??{kind:'NONE'};",'const value = input ?? { kind: "NONE" };']:
   source='before\n'+anchor+'\nafter';result=patch.disable_percent(source)
   self.assertIn('percentage discounts are disabled',result);self.assertTrue(result.startswith('before\n'+anchor));self.assertTrue(result.endswith('\nafter'));self.assertEqual(patch.disable_percent(result),result)
  with self.assertRaises(AssertionError):patch.disable_percent('unknown runtime')
 def test_web_install_is_idempotent_and_keeps_original_wrapper_hooks(self):
  source='\n'.join(['import { createOffersHandler } from "./offers/handler.mjs";','const handleOffers = createOffersHandler({ origin });','  if (await handleOffers(request, response, pathname)) return;','function injectOffers(html, pathname) {','return html;','}','function injectStorefrontLayerFix(html) {','return html;','}'])
  with tempfile.TemporaryDirectory() as directory:
   root=Path(directory);base=root/'base';base.mkdir();(base/'server.mjs').write_text(source)
   result=patch.patch_runtime(base,root/'first');self.assertFalse(result['databaseWrites']);self.assertEqual((base/'server.mjs').read_text(),source)
   patched=(root/'first/server.mjs').read_text();(base/'server.mjs').write_text(patched);patch.patch_runtime(base,root/'second');self.assertEqual((root/'second/server.mjs').read_text(),patched)
if __name__=='__main__':unittest.main()
