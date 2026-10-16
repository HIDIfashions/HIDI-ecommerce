import importlib.util,unittest
from pathlib import Path
HERE=Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location('patch',HERE/'patch-runtime.py');patch=importlib.util.module_from_spec(spec);spec.loader.exec_module(patch)
class Tests(unittest.TestCase):
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
