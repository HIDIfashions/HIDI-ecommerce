"""Focused fail-closed tests for the reviewed Shop All heading and intro patch."""
import hashlib
import importlib.util
import json
from pathlib import Path
import unittest

HERE=Path(__file__).resolve().parent

def load_patch():
    spec=importlib.util.spec_from_file_location('seo_discovery_collection_patch',HERE/'patch-runtime.py')
    module=importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module

patch=load_patch()

class CollectionIntroPatchTest(unittest.TestCase):
    def baseline(self):
        data=(HERE/'fixtures/collection-all-before.js').read_bytes()
        self.assertEqual(len(data),4099)
        self.assertEqual(hashlib.sha256(data).hexdigest(),patch.COLLECTION_ALL_SHA)
        return data

    def test_exact_live_baseline_has_reviewed_shop_all_semantics(self):
        text=self.baseline().decode()
        self.assertEqual(text.count('i="All Products"'),1)
        self.assertEqual(text.count('j='+json.dumps(patch.COLLECTION_ALL_OLD_DESCRIPTION,ensure_ascii=False,separators=(',',':'))),1)
        self.assertEqual(text.count('(0,d.jsx)("header",{className:"collection-header",children:(0,d.jsx)("h1",{children:i})})'),1)
        self.assertEqual(text.count('position:2,name:i,item:(0,g.rf)("/collections/all")'),1)
        self.assertEqual(text.count('(0,d.jsx)(e.CollectionBrowser,{products:a})'),1)
        self.assertNotIn('hidi-collection-intro',text)
        self.assertNotIn(patch.COLLECTION_ALL_TITLE,text)
        self.assertNotIn(patch.COLLECTION_ALL_DESCRIPTION,text)

    def test_exact_renderer_patch_adds_only_reviewed_heading_and_intro(self):
        before=self.baseline()
        after=patch.patch_collection_all(before)
        text=after.decode()
        self.assertEqual(text.count(patch.COLLECTION_ALL_TITLE),1)
        self.assertEqual(text.count(patch.COLLECTION_ALL_DESCRIPTION),1)
        self.assertEqual(text.count('className:"hidi-collection-intro"'),1)
        self.assertEqual(text.count('style:{display:"block"}'),2)
        self.assertIn('k={title:i',text)
        self.assertEqual(text.count('title:i+" | HIDI"'),2)
        self.assertEqual(text.count('position:2,name:i,item:(0,g.rf)("/collections/all")'),1)
        self.assertNotIn('i="All Products"',text)
        self.assertNotIn(patch.COLLECTION_ALL_OLD_DESCRIPTION,text)
        self.assertIn('(0,d.jsx)(e.CollectionBrowser,{products:a})',text)

    def test_renderer_digest_and_unique_anchors_fail_closed(self):
        changed=self.baseline().replace(b'i="All Products"',b'i="Other Products"',1)
        with self.assertRaises(AssertionError):
            patch.patch_collection_all(changed)
        with self.assertRaises(AssertionError):
            patch.exact('anchor anchor',[('anchor','replacement')])
        with self.assertRaises(AssertionError):
            patch.exact('different',[('anchor','replacement')])

if __name__=='__main__':
    unittest.main()
