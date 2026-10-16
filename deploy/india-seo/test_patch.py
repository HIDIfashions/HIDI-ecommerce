import hashlib
import importlib.util
import json
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('india_patch', HERE/'patch-runtime.py')
patch = importlib.util.module_from_spec(spec)
spec.loader.exec_module(patch)

class PatchTests(unittest.TestCase):
    def test_inspected_collection_and_inverse(self):
        before = (HERE/'fixtures/collection-before.js').read_bytes().rstrip(b'\n')
        self.assertEqual(hashlib.sha256(before).hexdigest(), patch.COLLECTION_SHA)
        after = patch.collection_patch(before)
        restored = after.decode().replace(patch.NEW_HEADER, patch.OLD_HEADER, 1)
        compact = lambda v: json.dumps(v, ensure_ascii=False, separators=(',', ':'))
        for slug,new in json.loads((HERE/'collections.json').read_text()).items():
            restored = restored.replace(compact({slug:new})[1:-1], compact({slug:patch.OLD_LABELS[slug]})[1:-1], 1)
        self.assertEqual(restored.encode(), before)
        self.assertIn(b'hidi-collection-intro', after)

    def test_drift_and_duplicate_anchors_fail_closed(self):
        before = (HERE/'fixtures/collection-before.js').read_bytes().rstrip(b'\n')
        with self.assertRaises(AssertionError): patch.collection_patch(before+b' ')
        with self.assertRaises(AssertionError): patch.bundle_patch(b'new independent release')
        with self.assertRaises(AssertionError): patch.exact('one one', [('one','two')])

    def test_dedicated_shop_all_renderer(self):
        before = (HERE/'fixtures/all-before.js').read_bytes().rstrip(b'\n')
        self.assertEqual(hashlib.sha256(before).hexdigest(), patch.ALL_SHA)
        after = patch.all_patch(before)
        self.assertIn(b'i="Women\'s Kurta Sets & Indian Wear"', after)
        self.assertEqual(after.count(b'hidi-collection-intro'), 1)
        self.assertIn(b'let a=await (0,f.d$)()', after)
        with self.assertRaises(AssertionError): patch.all_patch(before+b' ')

    def test_landing_changes_only_caption_destination_and_click_lookup(self):
        source = patch.OLD_CARD+'\nconst open=()=>'+patch.OLD_OPEN+';'
        result = patch.exact(source, [(patch.OLD_CARD,patch.NEW_CARD),(patch.OLD_OPEN,patch.NEW_OPEN)])
        self.assertEqual(result.replace(patch.NEW_CARD,patch.OLD_CARD).replace(patch.NEW_OPEN,patch.OLD_OPEN),source)
        self.assertNotIn('fetch(', result)
        self.assertNotIn('storagePut', result)

if __name__ == '__main__': unittest.main()
