import importlib.util,unittest,tempfile
from pathlib import Path
HERE=Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location('cleanup',HERE/'patch-runtime.py');p=importlib.util.module_from_spec(spec);spec.loader.exec_module(p)
class Tests(unittest.TestCase):
 def test_only_visible_header_changes(self):
  for name,before,after in [('collection-before.js',p.previous.collection_patch,p.collection_patch),('all-before.js',p.previous.all_patch,p.all_patch)]:
   original=(HERE.parent/'india-seo/fixtures'/name).read_bytes().rstrip(b'\n');live=before(original);result=after(live)
   self.assertNotIn(b'hidi-collection-intro',result);self.assertNotIn(b'Explore HIDI collections',result)
   self.assertEqual(result.count(b'd$)'),live.count(b'd$)'))
   self.assertEqual(result.split(b'async function')[0],live.split(b'async function')[0]) if name.startswith('collection') else None
   for token in [b'generateMetadata',b'openGraph',b'twitter',b'alternates']:
    self.assertEqual(result.count(token),live.count(token))
   with self.assertRaises(AssertionError):after(result)
 def test_unknown_or_duplicate_anchors_fail_closed(self):
  with self.assertRaises(AssertionError):p.all_patch(b'changed runtime')
  fixture=(HERE.parent/'india-seo/fixtures/all-before.js').read_bytes().rstrip(b'\n');live=p.previous.all_patch(fixture)
  with self.assertRaises(AssertionError):p.all_patch(live+live)
 def test_only_two_server_files_changed(self):
  with tempfile.TemporaryDirectory() as folder:
   root=Path(folder);base=root/'base';overlay=root/'overlay'
   for path,name,fn in [(p.previous.COLLECTION_PATH,'collection-before.js',p.previous.collection_patch),(p.previous.ALL_PATH,'all-before.js',p.previous.all_patch)]:
    file=base/path;file.parent.mkdir(parents=True,exist_ok=True);file.write_bytes(fn((HERE.parent/'india-seo/fixtures'/name).read_bytes().rstrip(b'\n')))
   result=p.patch_runtime(base,overlay);self.assertEqual(len(result['allowedFiles']),2)
if __name__=='__main__':unittest.main()
