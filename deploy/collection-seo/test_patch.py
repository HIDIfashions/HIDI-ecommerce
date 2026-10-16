import importlib.util,unittest
from pathlib import Path
HERE=Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location('patch',HERE/'patch-runtime.py');patch=importlib.util.module_from_spec(spec);spec.loader.exec_module(patch)
class Tests(unittest.TestCase):
 def test_hydration_assets_are_versioned_and_old_assets_preserved(self):
  import tempfile,json,importlib.util
  spec=importlib.util.spec_from_file_location('hydrate',HERE/'hydration.py');h=importlib.util.module_from_spec(spec);spec.loader.exec_module(h)
  with tempfile.TemporaryDirectory() as folder:
   base=Path(folder);chunks=base/'apps/web/.next/static/chunks';chunks.mkdir(parents=True)
   original=h.HOOK+'} Sort products';client=chunks/'442-1234567890abcdef.js';client.write_text(original)
   runtime=chunks/'webpack-fedcba0987654321.js';runtime.write_text('442:"1234567890abcdef"')
   manifest=base/'apps/web/.next/app-build-manifest.json';manifest.write_text(json.dumps({'assets':[client.name,runtime.name]}))
   pricing=base/'pricing/storefront.mjs';pricing.parent.mkdir();pricing.write_text("function apply(){\n}\nwindow.addEventListener('pageshow',refresh);")
   files=h.changes(base)
   self.assertEqual(client.read_text(),original)
   self.assertNotIn(client.relative_to(base).as_posix(),files)
   self.assertNotIn(runtime.relative_to(base).as_posix(),files)
   self.assertEqual(sum('/static/chunks/' in name for name in files),2)
   updated=files[manifest.relative_to(base).as_posix()].decode()
   self.assertNotIn(client.name,updated);self.assertNotIn(runtime.name,updated)
   self.assertIn(h.GUARD.encode(),files['pricing/storefront.mjs'])

 def test_renderers_and_preserved_product_fetch(self):
  for name,fn in [('collection-before.js',patch.collection_patch),('all-before.js',patch.all_patch)]:
   original=(HERE.parent/'india-seo/fixtures'/name).read_bytes().rstrip(b'\n')
   result=fn(original)
   self.assertIn(b'Explore HIDI collections',result)
   self.assertIn(b'hidi-collection-intro',result)
   self.assertEqual(result.count(b'd$)'),original.count(b'd$)'))
 def test_duplicate_or_changed_anchor_rejected(self):
  with self.assertRaises(AssertionError):patch.exact('one one',[('one','two')])
  with self.assertRaises(AssertionError):patch.all_patch(b'changed runtime')
if __name__=='__main__':unittest.main()
