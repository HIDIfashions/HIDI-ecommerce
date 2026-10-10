import copy, importlib.util, json, os, tempfile, unittest
from unittest.mock import patch
from pathlib import Path

def load(path):
    spec=importlib.util.spec_from_file_location(path.stem,path);module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module);return module
compose=load(Path('deploy/order-notifications/compose.py'))
rollout=load(Path('deploy/order-notifications/rollout.py'))
class Release(unittest.TestCase):
    def test_module_patch_preserves_every_original_byte(self):
        original='import { MarketingModule } from "./marketing/marketing.module.js";\nlet AppModule;\nimports: [ExistingModule, MarketingModule]\n'
        patched=compose.patch_module(original)
        self.assertEqual(patched.replace('\n'+compose.IMPORT,'').replace('MarketingModule, OrderNotificationModule]','MarketingModule]'),original)
        self.assertEqual(compose.patch_module(patched),patched)
        with self.assertRaises(AssertionError):compose.patch_module(patched.replace('MarketingModule, OrderNotificationModule]', 'OtherModule, OrderNotificationModule]'))
        with self.assertRaises(AssertionError):compose.patch_module('Unknown module structure')
    def test_existing_payment_auth_and_dependency_files_are_protected(self):
        with tempfile.TemporaryDirectory() as directory:
            base=Path(directory)/'old';new=Path(directory)/'new'
            for root in [base,new]:
                for path,text in [('apps/api/dist/app.module.js','old'),('apps/api/dist/payments/payments.service.js','payment'),('apps/api/dist/auth/supabase-auth.service.js','auth'),('node_modules/dependency','dependency')]:
                    p=root/path;p.parent.mkdir(parents=True,exist_ok=True);p.write_text(text)
            (new/'apps/api/dist/app.module.js').write_text('new')
            added=new/'apps/api/dist/order-notifications/service.js';added.parent.mkdir();added.write_text('new module')
            configs=[{'Config':{'Cmd':['node','main.js']},'RootFS':{'Layers':['old']}},{'Config':{'Cmd':['node','main.js']},'RootFS':{'Layers':['old','new']}}]
            self.assertTrue(compose.verify(base,new,configs)['passed'])
            (base/'apps/api/dist/app.module.js').write_text('new')
            (base/'apps/api/dist/order-notifications').mkdir()
            (base/'apps/api/dist/order-notifications/service.js').write_text('previous module')
            self.assertTrue(compose.verify(base,new,configs)['passed'])
            (new/'apps/api/dist/payments/payments.service.js').write_text('unrelated change')
            with self.assertRaises(AssertionError):compose.verify(base,new,configs)
    def test_image_patch_keeps_secrets_probes_resources_and_other_containers(self):
        data={'location':'centralindia','properties':{'template':{'containers':[{'image':'old','env':[{'name':'RAZORPAY_KEY_SECRET','secretRef':'razorpay-live-key-secret'}],'probes':[{'type':'Readiness','httpGet':{'path':'/v1/health/ready','port':4000}}],'resources':{'cpu':0.5,'memory':'1Gi'}}],'scale':{'minReplicas':1}}}}
        patch=rollout.image_patch(data,'candidate','notification')
        self.assertEqual(data['properties']['template']['containers'][0]['image'],'old')
        kept=patch['properties']['template']['containers'][0]
        self.assertEqual(kept['env'],data['properties']['template']['containers'][0]['env'])
        self.assertEqual(kept['probes'],data['properties']['template']['containers'][0]['probes'])
        self.assertEqual(kept['resources'],data['properties']['template']['containers'][0]['resources'])
        self.assertNotIn('scale',patch['properties']['template'])
    def test_active_worker_blocks_disabled_installation(self):
        def data(value):return {'properties':{'template':{'containers':[{'env':[{'name':'ORDER_NOTIFICATIONS_ENABLED','value':value}]}]}}}
        rollout.assert_disabled(data('false'))
        with self.assertRaises(AssertionError):rollout.assert_disabled(data('true'))
    def test_failed_probe_rolls_back_owned_candidate_and_preserves_independent_release(self):
        for drift in [False,True]:
            with self.subTest(independentRelease=drift), tempfile.TemporaryDirectory() as directory:
                states={'hidi-api':{'image':'acrhidiprod0927.azurecr.io/hidi-api@sha256:'+'1'*64,'settingsHash':'api-settings','latest':'old-api','ready':'old-api'},
                        'hidi-web':{'image':'web-old','settingsHash':'web-settings','latest':'old-web','ready':'old-web'}}
                def data(name):return {'state':copy.deepcopy(states[name])}
                work=Path(directory)/rollout.PRIVATE;work.mkdir()
                for name in states:(work/(name+'.json')).write_text(json.dumps(data(name)))
                candidate='acrhidiprod0927.azurecr.io/hidi-api@sha256:'+'2'*64
                writes=[]
                def write_image(_data,image,suffix):
                    writes.append(image);states['hidi-api'].update(image=image,latest='hidi-api--'+suffix,ready='hidi-api--'+suffix)
                def get(_path,*args):
                    if drift:states['hidi-api']['image']='independent-release'
                    raise RuntimeError('Health failure')
                with patch.dict(os.environ,{'RUNNER_TEMP':directory,'GITHUB_RUN_ID':'123'}), \
                     patch.object(rollout.base,'app',side_effect=data),patch.object(rollout.base,'snapshot',side_effect=lambda d:d['state']), \
                     patch.object(rollout,'assert_disabled'),patch.object(rollout,'write_image',side_effect=write_image), \
                     patch.object(rollout,'wait_ready',side_effect=lambda image,suffix:data('hidi-api')),patch.object(rollout.base,'get',side_effect=get):
                    with self.assertRaises(RuntimeError):rollout.deploy(candidate)
                self.assertEqual(writes,[candidate] if drift else [candidate,'acrhidiprod0927.azurecr.io/hidi-api@sha256:'+'1'*64])
                self.assertEqual(states['hidi-web']['image'],'web-old')
if __name__=='__main__':unittest.main()
