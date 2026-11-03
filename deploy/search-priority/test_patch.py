import importlib.util,json,tempfile,unittest
from pathlib import Path
HERE=Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location('patch',HERE/'patch-runtime.py');p=importlib.util.module_from_spec(spec);spec.loader.exec_module(p)
class PatchTests(unittest.TestCase):
 def fixture(self,base):
  files={
   'seo-document/discovery.mjs':(HERE.parent/'seo-document/discovery.mjs').read_text(encoding='utf-8'),
   'seo-discovery/metadata.mjs':(HERE.parent/'seo-discovery/metadata.mjs').read_text(encoding='utf-8'),
   'apps/web/.next/server/app/collections/all/page.js':'const i="All Products";const header=(0,d.jsx)("header",{className:"collection-header",children:(0,d.jsx)("h1",{children:i})});const commerce="unchanged";',
   'apps/web/.next/server/app/about/page.js':'const x={children:"Explore HIDI"};const contact="unchanged";',
   'dist/index.html':'<link href="/assets/index-baseline.js"><script type="module" crossorigin src="/assets/index-baseline.js"></script>',
   'dist/assets/index-baseline.js':'const x=[H.jsx(Af,{})]}),H.jsx(Vf,{})];const link={href:"/collections/all",children:"Our range"};const commerce="unchanged";'
  }
  for n,s in files.items():
   f=base/n;f.parent.mkdir(parents=True,exist_ok=True);f.write_text(s,encoding='utf-8')
  return files
 def test_scoped_content_and_old_asset_preserved(self):
  with tempfile.TemporaryDirectory() as tmp:
   base=Path(tmp)/'base';overlay=Path(tmp)/'overlay';original=self.fixture(base);report=p.patch_runtime(base,overlay)
   self.assertTrue(report['passed']);self.assertEqual(len(report['allowedFiles']),6)
   for n,s in original.items():self.assertEqual((base/n).read_text(encoding='utf-8'),s)
   self.assertFalse((overlay/'dist/assets/index-baseline.js').exists())
   js=next((overlay/'dist/assets').glob('*.js')).read_text(encoding='utf-8');self.assertIn(p.COPY['intro'],js);self.assertIn('const commerce="unchanged"',js)
   self.assertIn('data-hidi-home-discovery',js);self.assertNotIn('MutationObserver',js)
   doc=(overlay/'seo-document/discovery.mjs').read_text(encoding='utf-8');self.assertIn(p.COPY['intro'],doc);self.assertIn('Shop HIDI kurta sets',doc)
   self.assertIn('const commerce="unchanged"',(overlay/'apps/web/.next/server/app/collections/all/page.js').read_text(encoding='utf-8'))
 def test_unknown_or_duplicate_anchor_refused(self):
  for replacement in ['changed', 'i="All Products";i="All Products";']:
   with tempfile.TemporaryDirectory() as tmp:
    base=Path(tmp)/'base';self.fixture(base);(base/'apps/web/.next/server/app/collections/all/page.js').write_text(replacement)
    with self.assertRaises(AssertionError):p.patch_runtime(base,Path(tmp)/'overlay')
    self.assertFalse((Path(tmp)/'overlay').exists())
 def test_exact_replacement_rejects_reapply(self):
  self.assertEqual(p.exact('before TARGET after','TARGET','NEW'),'before NEW after')
  with self.assertRaises(AssertionError):p.exact('TARGET TARGET','TARGET','NEW')
if __name__=='__main__':unittest.main()
