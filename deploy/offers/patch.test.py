import importlib.util
from pathlib import Path
import tempfile
import unittest
HERE=Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location('offer_patch',HERE/'patch-runtime.py');patch=importlib.util.module_from_spec(spec);spec.loader.exec_module(patch)
class Patch(unittest.TestCase):
    def test_existing_bytes_preserved_and_duplicate_or_unknown_runtime_rejected(self):
        source='\n'.join(anchor for anchor,_ in patch.HOOKS)
        changed=patch.patch_web(source)
        self.assertIn('createOffersHandler',changed)
        with self.assertRaises(AssertionError):patch.patch_web(changed)
        with self.assertRaises(AssertionError):patch.patch_web(source.replace('createHeroMediaHandler','somethingElse'))
    def test_api_controller_body_is_identical_between_narrow_hook_strings(self):
        source='class AuthController { config(){ return this.auth.authConfig(); } }\nexport { AuthController };'
        result=patch.patch_api(source)
        self.assertIn(source,result)
        self.assertTrue(result.endswith('attachOffersIdentity(AuthController);\n'))
        with self.assertRaises(AssertionError):patch.patch_api(result)
    def test_only_reviewed_web_files_written(self):
        with tempfile.TemporaryDirectory() as tmp:
            base=Path(tmp)/'base';base.mkdir();(base/'server.mjs').write_text('\n'.join(anchor for anchor,_ in patch.HOOKS));(base/'keep').write_text('keep')
            report=patch.patch_runtime(base,Path(tmp)/'overlay');self.assertTrue(report['passed']);self.assertEqual((base/'keep').read_text(),'keep');self.assertFalse(report['databaseWrites'])
if __name__=='__main__':unittest.main()
