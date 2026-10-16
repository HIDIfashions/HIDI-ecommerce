import contextlib,io,json,os,runpy,tempfile,unittest
from pathlib import Path
from unittest.mock import patch
SCRIPT=Path(__file__).resolve().with_name('wait-source-ci.py')
class SourceGateTests(unittest.TestCase):
 def run_gate(self,runs,jobs):
  replies=[io.BytesIO(json.dumps({'workflow_runs':runs}).encode()),io.BytesIO(json.dumps({'jobs':jobs}).encode())]
  with patch.dict(os.environ,{'GITHUB_REPOSITORY':'fixture/repo','GITHUB_SHA':'exact-source','GITHUB_TOKEN':'isolated-fixture'}),patch('urllib.request.urlopen',side_effect=replies),contextlib.redirect_stdout(io.StringIO()):
   runpy.run_path(str(SCRIPT),run_name='__main__')
 def test_requires_exact_source_success_and_records_proof(self):
  previous=Path.cwd()
  with tempfile.TemporaryDirectory() as folder:
   os.chdir(folder)
   try:
    with self.assertRaises(SystemExit) as done:self.run_gate([{'id':12,'head_sha':'exact-source'}],[{'id':34,'name':'source-and-test','status':'completed','conclusion':'success','html_url':'https://example.invalid/job'}])
    self.assertEqual(done.exception.code,0);proof=json.loads(Path('evidence/checkout-hydration-release/source-ci.json').read_text());self.assertTrue(proof['passed']);self.assertEqual(proof['sourceSha'],'exact-source')
   finally:os.chdir(previous)
 def test_failed_or_other_source_cannot_pass(self):
  with self.assertRaisesRegex(AssertionError,'regression failed'):self.run_gate([{'id':12,'head_sha':'exact-source'}],[{'id':34,'name':'source-and-test','status':'completed','conclusion':'failure','html_url':'https://example.invalid/job'}])
  with self.assertRaises(AssertionError):self.run_gate([{'id':12,'head_sha':'other-source'}],[])
if __name__=='__main__':unittest.main()
