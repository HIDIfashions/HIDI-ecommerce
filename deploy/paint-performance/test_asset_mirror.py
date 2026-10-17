import importlib.util,unittest,json,tempfile,io,contextlib,os
from unittest.mock import patch
from pathlib import Path
spec=importlib.util.spec_from_file_location('asset_mirror',Path(__file__).with_name('asset-mirror.py'));module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)

class InventoryTests(unittest.TestCase):
    def test_only_content_addressed_public_files_are_eligible(self):
        digest='a'*64
        module.validate_files({'/assets/index-'+digest[:16]+'.js':digest,'/media-performance/assets/poster-'+digest[:16]+'.avif':digest})
        for files in [{'/config.js':digest},{'/api/store/products':digest},{'/assets/../../private.json':digest},{'/assets/index-'+digest[:16]+'.js':'b'*64}]:
            with self.assertRaises(AssertionError):module.validate_files(files)
    def test_verify_rejects_paid_plan_and_domain_changes_before_network(self):
        for proof in [{'passed':True,'bootOnce':True,'sku':'Standard','dnsChanged':False,'existingAppsChanged':False},{'passed':True,'bootOnce':True,'sku':'Free','dnsChanged':True,'existingAppsChanged':False}]:
            with self.assertRaises(AssertionError):module.verify(proof)

    def test_preflight_checks_ownership_without_secrets_or_mutations(self):
        site={'sku':{'name':'Free','tier':'Free'},'tags':{'hidi-owner':module.OWNER,'hidi-purpose':'immutable-assets'},'defaultHostname':'hidi-test.3.azurestaticapps.net'}
        with patch.object(module,'az',return_value=site) as azure:
            proof=module.preflight()
        azure.assert_called_once_with('staticwebapp','show','-g',module.GROUP,'-n',module.NAME)
        self.assertTrue(proof['readOnly']);self.assertFalse(proof['secretsRead']);self.assertFalse(proof['productionChanges'])

    def test_preflight_refuses_missing_access_without_attempting_creation(self):
        error=module.subprocess.CalledProcessError(1,['az','staticwebapp','show'])
        with patch.object(module,'az',side_effect=error) as azure:
            with self.assertRaisesRegex(RuntimeError,'No deployment or asset publication'):
                module.preflight()
        self.assertEqual(azure.call_count,1)

    def test_preflight_refuses_paid_or_unrelated_resources(self):
        base={'sku':{'name':'Free','tier':'Free'},'tags':{'hidi-owner':module.OWNER,'hidi-purpose':'immutable-assets'},'defaultHostname':'hidi-test.3.azurestaticapps.net'}
        for change in [{'sku':{'name':'Standard','tier':'Standard'}},{'tags':{}},{'repositoryUrl':'https://github.com/another/site'}]:
            with self.subTest(change=change),patch.object(module,'az',return_value={**base,**change}):
                with self.assertRaises(AssertionError):module.preflight()

    def test_publication_retains_old_bytes_and_never_requests_a_paid_plan(self):
        for existing in [True,False]:
            with self.subTest(existing=existing),tempfile.TemporaryDirectory() as folder:
                root=Path(folder);overlay=root/'overlay';private=root/'private';out=root/'out'
                for path in [overlay/'paint-performance',private,out]:path.mkdir(parents=True)
                entry=b'if (!window.__HidiAppStarted) {window.__HidiAppStarted=true;}'
                data={}
                for prefix,suffix,body in [('/assets/index-','.js',entry),('/media-performance/assets/poster-','.avif',b'validated-picture'),('/media-performance/assets/hero-av1-','-1280.mp4',b'validated-video')]:
                    path=prefix+module.sha(body)[:16]+suffix;data[path]=body;target=overlay/'dist'/path.lstrip('/');target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(body)
                main=next(path for path in data if path.endswith('.js'));poster=next(path for path in data if path.endswith('.avif'));video=next(path for path in data if path.endswith('.mp4'))
                old=b'if (!window.__HidiAppStarted) {window.__HidiAppStarted=true;/*older*/}'
                oldpath='/assets/index-'+module.sha(old)[:16]+'.js';history={oldpath:module.sha(old)} if existing else {}
                host='hidi-test.3.azurestaticapps.net';calls=[];published=[];token='fake-unit-token-'*6
                site={'name':module.NAME,'sku':{'name':'Free','tier':'Free'},'tags':{'hidi-owner':module.OWNER,'hidi-purpose':'immutable-assets'},'defaultHostname':host}
                def azure(*args):
                    calls.append(args)
                    if args[:2]==('staticwebapp','list'):return [site] if existing else []
                    if args[:2]==('staticwebapp','show'):return site
                    if args[:2]==('staticwebapp','create'):
                        self.assertEqual(args[args.index('--sku')+1],'Free');self.assertNotIn('--source',args);return site
                    if args[:3]==('staticwebapp','secrets','list'):return {'properties':{'apiKey':token}}
                    raise AssertionError('Unexpected Azure mutation '+repr(args))
                def fetch(url):
                    path=url.removeprefix('https://'+host)
                    if path=='/asset-manifest.json':return json.dumps({'files':history}).encode(),{}
                    body=(private/'asset-site'/path.lstrip('/')).read_bytes() if published else old if path==oldpath else data[path]
                    kind='javascript' if path.endswith('.js') else 'image/avif' if path.endswith('.avif') else 'video/mp4'
                    return body,{'Cache-Control':'public,immutable','Access-Control-Allow-Origin':'*','Content-Type':kind}
                def deploy(args,**kwargs):
                    self.assertNotIn(token,args);self.assertEqual(kwargs['env']['SWA_CLI_DEPLOYMENT_TOKEN'],token);self.assertIn('--no-use-keychain',args);published.append(True)
                variant={'avifPoster':poster,'av1Url':video}
                with patch.object(module,'az',azure),patch.object(module,'get',fetch),patch.object(module.subprocess,'run',deploy),patch.dict(os.environ,{'GITHUB_SHA':'c'*40}),contextlib.redirect_stdout(io.StringIO()):
                    proof=module.publish(overlay,{'bundle':main.lstrip('/')},{'videos':{'/original.mp4':{'mobile':variant,'desktop':variant}}},private,out)
                self.assertTrue(proof['passed']);self.assertFalse(proof['dnsChanged']);self.assertEqual(len(published),1)
                final=json.loads((private/'asset-site/asset-manifest.json').read_text())['files']
                self.assertEqual(set(final),set(data)|set(history))
                if existing:self.assertEqual((private/'asset-site'/oldpath.lstrip('/')).read_bytes(),old)
                self.assertTrue(all(args[0]=='staticwebapp' and args[1] in ['list','show','create','secrets'] for args in calls))

if __name__=='__main__':unittest.main()
