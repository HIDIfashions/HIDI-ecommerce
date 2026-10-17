import copy
import importlib.util
from pathlib import Path
import unittest

spec=importlib.util.spec_from_file_location('activate',Path(__file__).resolve().parents[1]/'deploy/order-notifications/activate-sms.py')
activate=importlib.util.module_from_spec(spec); spec.loader.exec_module(activate)

class ActivationTests(unittest.TestCase):
    def before(self):
        return {'location':'centralindia','properties':{'template':{'containers':[{'name':'api','image':'immutable-digest','env':[{'name':'MSG91_AUTHKEY','secretRef':'existing-key'},{'name':'PAYMENT_SETTING','value':'unchanged'}],'resources':{'cpu':0.5},'probes':[{'type':'Liveness'}]}]}}}
    def test_preserves_live_container_and_secret_refs(self):
        before=self.before(); saved=copy.deepcopy(before); patch=activate.env_patch(before,'2026-10-17T10:00:00Z','sms-test'); self.assertEqual(before,saved)
        actual=patch['properties']['template']['containers'][0]; original=before['properties']['template']['containers'][0]
        for key in ['name','image','resources','probes']: self.assertEqual(actual[key],original[key])
        for entry in original['env']: self.assertIn(entry,actual['env'])
    def test_sms_only_and_explicit_cutoffs(self):
        env={e['name']:e.get('value') for e in activate.env_patch(self.before(),'2026-10-17T10:00:00Z','sms-test')['properties']['template']['containers'][0]['env']}
        for name in ['ORDER_SMS_ENABLED','ORDER_SMS_PROVIDER_VERIFIED','ORDER_NOTIFICATIONS_ENABLED']: self.assertEqual(env[name],'true')
        for name in ['ORDER_EMAIL_ENABLED','ORDER_WHATSAPP_ENABLED']: self.assertEqual(env[name],'false')
        self.assertEqual(env['ORDER_SMS_START_AT'],env['ORDER_NOTIFICATIONS_START_AT'])
    def test_preserves_master_cutoff(self):
        before=self.before(); before['properties']['template']['containers'][0]['env'].append({'name':'ORDER_NOTIFICATIONS_START_AT','value':'2026-10-10T00:00:00Z'})
        env={e['name']:e.get('value') for e in activate.env_patch(before,'2026-10-17T10:00:00Z','sms-test')['properties']['template']['containers'][0]['env']}
        self.assertEqual(env['ORDER_NOTIFICATIONS_START_AT'],'2026-10-10T00:00:00Z')
    def test_refuses_resetting_sms_cutoff(self):
        before=self.before(); before['properties']['template']['containers'][0]['env'].append({'name':'ORDER_SMS_START_AT','value':'2026-10-10T00:00:00Z'})
        with self.assertRaises(AssertionError): activate.env_patch(before,'2026-10-17T10:00:00Z','sms-test')

if __name__=='__main__': unittest.main()
