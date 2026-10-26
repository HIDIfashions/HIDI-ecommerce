"""Stage a callback credential without enabling replies; export only an encrypted handoff."""
import copy, importlib.util, json, os, pathlib, secrets, subprocess, sys, urllib.request, urllib.error
ROOT=pathlib.Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location('wa_stage_helpers',ROOT.parent/'delivery-sync/release.py');helper=importlib.util.module_from_spec(spec);spec.loader.exec_module(helper)
cloud=helper.cloud
PRIVATE=pathlib.Path(os.environ['RUNNER_TEMP'])/'wa-stage';PRIVATE.mkdir(mode=0o700,exist_ok=True);helper.PRIVATE=PRIVATE
EVIDENCE=pathlib.Path('evidence/whatsapp-stage');EVIDENCE.mkdir(parents=True,exist_ok=True)
KEY='msg91-ordering-webhook'
def main():
    original={name:cloud.app(name) for name in ['hidi-api','hidi-web']}
    for value in original.values():cloud.ready(cloud.snapshot(value))
    api=original['hidi-api'];env={v['name']:v for v in api['properties']['template']['containers'][0].get('env',[])}
    assert env.get('WHATSAPP_CHATBOT_ENABLED',{}).get('value')=='false'
    assert env.get('WHATSAPP_CHATBOT_PROVIDER',{}).get('value')=='msg91'
    assert env.get('MSG91_WHATSAPP_INTEGRATED_NUMBER',{}).get('value')=='917093709353'
    assert api['properties']['latestReadyRevisionName'].startswith('hidi-api--whatsappapi40260169477'),'Expected verified ordering release'
    existing=cloud.azure('containerapp','secret','list','-g','rg-hidi-prod','-n','hidi-api','--show-values')
    match=next((v for v in existing if v['name']==KEY),None)
    token=match.get('value') if match else secrets.token_urlsafe(48)
    assert isinstance(token,str) and len(token)>=64,'Existing credential needs inspection; refusing rotation'
    print('::add-mask::'+token)
    helper.unchanged(original)
    if not match:
        result=subprocess.run(['az','containerapp','secret','set','-g','rg-hidi-prod','-n','hidi-api','--secrets',KEY+'='+token,'--only-show-errors','-o','none'],capture_output=True,text=True)
        assert result.returncode==0,'Callback secret staging failed; sensitive output suppressed'
    current=cloud.app('hidi-api')
    expected=copy.deepcopy(api)
    expected['properties']['configuration']['secrets']=current['properties']['configuration']['secrets']
    assert cloud.snapshot(expected)==cloud.snapshot(current),'Unexpected change during secret staging'
    previous_names={v['name'] for v in api['properties']['configuration'].get('secrets',[])}
    assert {v['name'] for v in current['properties']['configuration']['secrets']}==previous_names|{KEY}
    for entry in api['properties']['configuration'].get('secrets',[]):
        assert entry in current['properties']['configuration']['secrets'],'Existing secret reference changed'
    desired=copy.deepcopy(current);entries=desired['properties']['template']['containers'][0]['env']
    prior=next((v for v in entries if v['name']=='MSG91_WHATSAPP_WEBHOOK_TOKEN'),None)
    assert not prior or prior.get('secretRef')==KEY,'Unexpected existing callback credential'
    entries[:]=[v for v in entries if v['name']!='MSG91_WHATSAPP_WEBHOOK_TOKEN']
    entries.append({'name':'MSG91_WHATSAPP_WEBHOOK_TOKEN','secretRef':KEY})
    value=helper.write(current,cloud.snapshot(current)['image'],'wasecret'+helper.RUN,restore=desired)
    helper.unchanged({'hidi-api':value,'hidi-web':original['hidi-web']})
    request=urllib.request.Request('https://hidiindia.com/api/store/whatsapp/msg91/webhook',data=b'{}',headers={'content-type':'application/json','x-hidi-whatsapp-token':token},method='POST')
    try:urllib.request.urlopen(request,timeout=20);raise AssertionError('Disabled bot accepted callback')
    except urllib.error.HTTPError as error:assert error.code==503,'Authenticated routing did not reach disabled worker'
    source="""(async()=>{const r=await fetch('https://control.msg91.com/api/v5/whatsapp/whatsapp-activation/',{headers:{authkey:process.env.MSG91_WHATSAPP_AUTHKEY||process.env.MSG91_AUTHKEY,accept:'application/json'},redirect:'error',signal:AbortSignal.timeout(15000)});const body=await r.json();const rows=[];function visit(v){if(!v||typeof v!=='object')return;if(Array.isArray(v)){v.forEach(visit);return;}if(Object.values(v).some(x=>typeof x==='string'&&x.replace(/\\D/g,'')==='917093709353')){const row={};for(const k of ['status','is_active','active','waba_id','phone_number_id','integrated_number','integratedNumber'])if(['string','number','boolean'].includes(typeof v[k]))row[k]=v[k];rows.push(row);}Object.values(v).filter(x=>x&&typeof x==='object').forEach(visit);}visit(body);console.log('HIDI_DELIVERY_RESULT::'+JSON.stringify({passed:true,readOnly:true,providerHttpStatus:r.status,responseFields:Object.keys(body),matchingNumbers:rows}));})().catch(()=>console.log('HIDI_DELIVERY_RESULT::'+JSON.stringify({passed:true,readOnly:true,providerReadFailed:true})));"""
    provider=helper.console.run(value,source)
    (EVIDENCE/'provider.json').write_text(json.dumps(provider,indent=2));print(json.dumps(provider))
    encrypted=subprocess.run(['openssl','pkeyutl','-encrypt','-pubin','-inkey',str(ROOT/'handoff-public.pem'),'-pkeyopt','rsa_padding_mode:oaep','-pkeyopt','rsa_oaep_md:sha256'],input=token.encode(),capture_output=True)
    assert encrypted.returncode==0,'Encrypted handoff failed; secret remains safely staged'
    (EVIDENCE/'callback-token.enc').write_bytes(encrypted.stdout)
    (EVIDENCE/'status.json').write_text(json.dumps({'passed':True,'orderingEnabled':False,'callbackSecretStaged':True,'validCredentialGetsDisabled503':True,'imagesUnchanged':True,'webUnchanged':True,'api':cloud.snapshot(value)},indent=2))
    print('PASS: callback secret staged; authenticated public route reaches disabled worker; encrypted handoff saved')
if __name__=='__main__':
    try:main()
    except Exception as error:
        print(str(error) if isinstance(error,AssertionError) else 'Secret staging stopped; sensitive output suppressed',file=sys.stderr);sys.exit(1)
