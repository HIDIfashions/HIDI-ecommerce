"""Run the pure settings transformer without Linux-only Azure console imports."""
import ast,copy,pathlib,unittest
tree=ast.parse(pathlib.Path('deploy/whatsapp-msg91/release.py').read_text())
function=next(n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name=='stage')
namespace={'copy':copy}
exec(compile(ast.Module(body=[function],type_ignores=[]),'release.py','exec'),namespace)
stage=namespace['stage']
class Settings(unittest.TestCase):
    def test_candidate_image_and_unrelated_settings_survive_combined_update(self):
        data={'properties':{'template':{'containers':[{'name':'api','image':'old-digest','env':[{'name':'DATABASE','secretRef':'unchanged-db'},{'name':'WHATSAPP_CHATBOT_ENABLED','value':'true'},{'name':'ORDER_NOTIFICATIONS_ENABLED','value':'true'}],'resources':{'cpu':1,'memory':'2Gi'},'probes':[{'type':'Liveness'}]}],'scale':{'minReplicas':1}},'configuration':{'ingress':{'external':False}},'identity':{'type':'SystemAssigned'}}}
        before=copy.deepcopy(data);result=stage(data,'tested-candidate-digest')
        self.assertEqual(data,before)
        container=result['properties']['template']['containers'][0]
        self.assertEqual(container['image'],'tested-candidate-digest')
        env={v['name']:v for v in container['env']}
        self.assertEqual(env['DATABASE'],{'name':'DATABASE','secretRef':'unchanged-db'})
        self.assertEqual(env['ORDER_NOTIFICATIONS_ENABLED']['value'],'true')
        self.assertEqual(env['WHATSAPP_CHATBOT_ENABLED']['value'],'false')
        self.assertEqual(env['WHATSAPP_CHATBOT_PROVIDER']['value'],'msg91')
        self.assertEqual(env['MSG91_WHATSAPP_INTEGRATED_NUMBER']['value'],'917093709353')
        container['image']='old-digest';container['env']=before['properties']['template']['containers'][0]['env']
        self.assertEqual(result,before)
if __name__=='__main__':unittest.main()
