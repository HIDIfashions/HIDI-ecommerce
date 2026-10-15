import importlib.util,pathlib,unittest
ROOT=pathlib.Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('refinements_patch',ROOT/'deploy/storefront-refinements/patch.py');patch=importlib.util.module_from_spec(spec);spec.loader.exec_module(patch)
class SurgicalPatches(unittest.TestCase):
 def test_index_changes_only_subscription_link_and_config_cache_version(self):
  original='<html><head><title>HIDI</title></head><body><script src="./config.js"></script></body></html>'
  result=patch.patch_index(original);self.assertIn('data-hidi-storefront-refinements',result);self.assertIn('config.js?v=',result);self.assertIn('<title>HIDI</title>',result)
 def test_index_fails_closed_on_unknown_or_duplicate_injection(self):
  for source in ['<head></head>','<head></head></head>','<head></head><script src="./config.js"></script><i data-hidi-storefront-refinements>']:
   with self.assertRaises(AssertionError):patch.patch_index(source)
 def test_config_preserves_every_other_published_setting(self):
  original="window.HIDI_CONFIG={message:'Complimentary shipping on ₹1,499 and above',other:'keep'};"
  result=patch.patch_config(original);self.assertEqual(result,"window.HIDI_CONFIG={message:'Shipping is ₹0.00 on every order',other:'keep'};")
  with self.assertRaises(AssertionError):patch.patch_config('unexpected')
 def test_subscription_patch_scopes_colours_to_footer_and_preserves_payment_theme(self):
  _,css,_=patch.assets();self.assertIn(b'#newsletter-form .newsletter-field button',css);self.assertNotIn(b'.checkout-pay-button',css);self.assertNotIn(b'.site-header',css)


import copy,json,os,tempfile
from unittest.mock import patch as mock
spec=importlib.util.spec_from_file_location('refinements_release',ROOT/'deploy/storefront-refinements/release.py');release=importlib.util.module_from_spec(spec);spec.loader.exec_module(release)
class ReleaseGuards(unittest.TestCase):
 def setUp(self):
  self.temp=tempfile.TemporaryDirectory();self.addCleanup(self.temp.cleanup);folder=pathlib.Path(self.temp.name);release.WORK=folder/'private';release.OUT=folder/'evidence';release.setup()
  self.old={name:{'image':'acrhidiprod0927.azurecr.io/'+name+'@sha256:'+char*64,'settingsHash':'retained-settings','latest':name+'--original','ready':name+'--original','mode':'Single'} for name,char in [('hidi-api','a'),('hidi-web','b')]};self.current=copy.deepcopy(self.old);self.writes=[]
  self.new={name:'acrhidiprod0927.azurecr.io/'+name+'@sha256:'+char*64 for name,char in [('hidi-api','c'),('hidi-web','d')]}
  for name,data in self.old.items():(release.WORK/(name+'.json')).write_text(json.dumps(data))
  (release.OUT/'published-before.json').write_text('{}');(release.OUT/'candidate').mkdir()
  (release.OUT/'candidate/report.json').write_text(json.dumps({'reports':[{'engine':engine,'width':width,'status':'PASS'} for engine in ['chromium','firefox','webkit'] for width in [320,390,844,1440]]}))
  self.receipt={'passed':True,'compiledApiFixturesPassed':True,'retainedUploadChecksPassed':True,'adminRoutesPassed':True,'runId':'123','commit':'tested-commit','apiId':'tested-api','webId':'tested-web'};(release.OUT/'candidate-verified.json').write_text(json.dumps(self.receipt))
  patches=[mock.dict(os.environ,{'GITHUB_RUN_ID':'123','GITHUB_SHA':'tested-commit'}),mock.object(release.cloud,'app',side_effect=lambda name:copy.deepcopy(self.current[name])),mock.object(release.cloud,'snapshot',side_effect=copy.deepcopy),mock.object(release.cloud,'ready',return_value=None),mock.object(release,'public',return_value={}),mock.object(release.cloud,'get',return_value=b'ok'),mock.object(release.helpers,'docker',side_effect=lambda *args:'tested-api' if args[-1]==self.new['hidi-api'] else 'tested-web'),mock.object(release,'wait',side_effect=lambda name,*args:copy.deepcopy(self.current[name]))]
  for patcher in patches:patcher.start();self.addCleanup(patcher.stop)
 def write(self,data,image,suffix):
  name=next(name for name in self.current if image.startswith('acrhidiprod0927.azurecr.io/'+name+'@'));self.writes.append((name,image));self.current[name]['image']=image;self.current[name]['latest']=self.current[name]['ready']=name+'--'+suffix
 def run_apply(self):release.apply(self.new['hidi-api'],self.new['hidi-web'])
 def test_missing_or_incomplete_candidate_receipt_cannot_deploy(self):
  (release.OUT/'candidate-verified.json').unlink()
  with mock.object(release.cloud,'write_image',side_effect=self.write),self.assertRaises(FileNotFoundError):self.run_apply()
  self.assertEqual(self.writes,[])
 def test_wrong_tested_image_cannot_deploy(self):
  self.receipt['apiId']='different';(release.OUT/'candidate-verified.json').write_text(json.dumps(self.receipt))
  with mock.object(release.cloud,'write_image',side_effect=self.write),self.assertRaises(AssertionError):self.run_apply()
  self.assertEqual(self.writes,[])
 def test_missing_mobile_browser_case_cannot_deploy(self):
  (release.OUT/'candidate/report.json').write_text(json.dumps({'reports':[]}))
  with mock.object(release.cloud,'write_image',side_effect=self.write),self.assertRaises(AssertionError):self.run_apply()
  self.assertEqual(self.writes,[])
 def test_live_verification_failure_restores_both_owned_images(self):
  with mock.object(release.cloud,'write_image',side_effect=self.write),mock.object(release.subprocess,'run',side_effect=RuntimeError('fixture live verification failed')),self.assertRaises(RuntimeError):self.run_apply()
  self.assertEqual({name:state['image'] for name,state in self.current.items()},{name:state['image'] for name,state in self.old.items()})
  self.assertEqual(json.loads((release.OUT/'rollback.json').read_text())['restoredApps'],['hidi-web','hidi-api'])
 def test_web_update_failure_still_restores_api(self):
  def write(data,image,suffix):
   if image==self.new['hidi-web']:raise RuntimeError('fixture rejected web update')
   self.write(data,image,suffix)
  with mock.object(release.cloud,'write_image',side_effect=write),self.assertRaises(RuntimeError):self.run_apply()
  self.assertEqual(self.current['hidi-api']['image'],self.old['hidi-api']['image']);self.assertEqual(self.current['hidi-web']['image'],self.old['hidi-web']['image'])
 def test_concurrent_production_image_is_never_overwritten(self):
  self.current['hidi-web']['image']='independent-image'
  with mock.object(release.cloud,'write_image',side_effect=self.write),self.assertRaises(AssertionError):self.run_apply()
  self.assertEqual(self.writes,[]);self.assertEqual(self.current['hidi-web']['image'],'independent-image')
 def test_rollback_error_for_one_app_does_not_prevent_other_restore(self):
  def write(data,image,suffix):
   if 'rollbackweb' in suffix:raise RuntimeError('fixture rollback failed')
   self.write(data,image,suffix)
  with mock.object(release.cloud,'write_image',side_effect=write),mock.object(release.subprocess,'run',side_effect=RuntimeError('fixture live failed')),self.assertRaises(RuntimeError):self.run_apply()
  report=json.loads((release.OUT/'rollback.json').read_text());self.assertIn('hidi-api',report['restoredApps']);self.assertEqual(report['unrestoredApps'][0]['app'],'hidi-web')
if __name__=='__main__':unittest.main()
