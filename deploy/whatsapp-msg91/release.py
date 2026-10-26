"""Deploy narrowly composed ordering images, disabled, with exact-image rollback."""
import copy, importlib.util, json, os, pathlib, shutil, subprocess, sys
ROOT=pathlib.Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location('wa_helpers',ROOT.parent/'delivery-sync/release.py');helper=importlib.util.module_from_spec(spec);spec.loader.exec_module(helper)
cloud,images=helper.cloud,helper.images
def app(name):
    assert name in {'hidi-api','hidi-web'}
    return cloud.azure('rest','--method','get','--url','https://management.azure.com/subscriptions/91d9572d-0f0b-47fe-802d-0eef36d7c719/resourceGroups/rg-hidi-prod/providers/Microsoft.App/containerApps/'+name+'?api-version=2025-07-01')
cloud.app=app
PRIVATE=pathlib.Path(os.environ['RUNNER_TEMP'])/'whatsapp-release';PRIVATE.mkdir(exist_ok=True,mode=0o700)
EVIDENCE=pathlib.Path('evidence/whatsapp-release');EVIDENCE.mkdir(parents=True,exist_ok=True)
helper.PRIVATE=PRIVATE
RUN=helper.RUN
EXPECTED={'hidi-api':'acrhidiprod0927.azurecr.io/hidi-api@sha256:e9ca682c4f04b91f3eda33e941cea1281598405eeaf7e7cab0525571b69c96b8','hidi-web':'acrhidiprod0927.azurecr.io/hidi-web@sha256:573642af571ad10b3648137ab3b0988d567703150603d4a1f1f2293251e94450'}
STEMS=['whatsapp.service','whatsapp.controller','whatsapp.module','msg91.service','msg91-protocol']
def save(name,value):(EVIDENCE/name).write_text(json.dumps(value,indent=2))
def read(name):return json.loads((EVIDENCE/name).read_text())
def old():return json.loads((PRIVATE/'originals.json').read_text())
def prepare():
    original={name:cloud.app(name) for name in EXPECTED}
    for name,data in original.items():
        state=cloud.snapshot(data);cloud.ready(state);assert state['image']==EXPECTED[name],'Live image changed since inspection'
    assert original['hidi-api']['properties']['template']['scale']['minReplicas']>=1
    (PRIVATE/'originals.json').write_text(json.dumps(original));(PRIVATE/'originals.json').chmod(0o600)
    save('before.json',{name:cloud.snapshot(data) for name,data in original.items()})
    for kind in ['api','web']:
        name='hidi-'+kind;image=EXPECTED[name]
        subprocess.run(['docker','pull',image],check=True)
        backup=images.REGISTRY+'/'+name+':whatsapp-backup-'+RUN
        subprocess.run(['docker','buildx','imagetools','create','--tag',backup,image],check=True)
        folder=PRIVATE/kind;folder.mkdir();base=folder/'base';overlay=folder/'overlay';candidate=folder/'candidate'
        images.extract(image,base);overlay.mkdir();allowed=set()
        if kind=='api':
            assert 'WhatsAppModule' in (base/'apps/api/dist/app.module.js').read_text(),'Existing module registration required'
            for stem in STEMS:
                for ext in ['.js','.js.map','.d.ts']:
                    rel='apps/api/dist/whatsapp/'+stem+ext;source=pathlib.Path(rel)
                    if not source.exists():continue
                    dest=overlay/rel;dest.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(source,dest);allowed.add(rel)
            assert len([x for x in allowed if x.endswith('.js')])==5
        else:
            server=(base/'server.mjs').read_text();anchor='  if (await handleSupport(request, response, pathname)) return;'
            added='  if (await handleMsg91Ordering(request, response, pathname)) return;\n'
            imp='import { handleMsg91Ordering } from "./whatsapp-msg91/handler.mjs";\n'
            assert server.count(anchor)==1 and 'handleMsg91Ordering' not in server,'Runtime structure changed'
            patched=imp+server.replace(anchor,added+anchor)
            assert patched.removeprefix(imp).replace(added,'')==server
            (overlay/'server.mjs').write_text(patched)
            (overlay/'whatsapp-msg91').mkdir();shutil.copyfile(ROOT/'handler.mjs',overlay/'whatsapp-msg91/handler.mjs')
            allowed={'server.mjs','whatsapp-msg91/handler.mjs'}
            subprocess.run(['node','--check',str(overlay/'server.mjs')],check=True)
        tag=images.REGISTRY+'/'+name+':whatsapp-'+RUN
        (folder/'.dockerignore').write_text('*\n!Dockerfile\n!overlay/\n!overlay/**\n')
        (folder/'Dockerfile').write_text('FROM '+image+'\nCOPY --chown=node:node overlay/ /app/\n')
        subprocess.run(['docker','build','--pull=false','-t',tag,str(folder)],check=True);images.extract(tag,candidate)
        report=helper.preserve.verify(base,candidate,overlay,allowed,json.loads(images.docker('image','inspect',image,tag)))
        report.update({'baseImage':image,'candidateTag':tag,'imageId':json.loads(images.docker('image','inspect',tag))[0]['Id'],'backup':backup})
        save(kind+'-preservation.json',report)
    helper.unchanged(original)
def test():
    api=read('api-preservation.json')['candidateTag'];web=read('web-preservation.json')['candidateTag']
    subprocess.run(['docker','run','--rm','--network','host','--entrypoint','node','-e','WHATSAPP_TEST_SQL_HOST=127.0.0.1','-e','WHATSAPP_TEST_SQL_PASSWORD='+os.environ['WHATSAPP_TEST_SQL_PASSWORD'],'-v',str(pathlib.Path('tests').resolve())+':/app/tests:ro','-v',str(pathlib.Path('apps/api/prisma').resolve())+':/app/apps/api/prisma:ro',api,'/app/tests/whatsapp-msg91.sqlserver.mjs'],check=True,timeout=180)
    subprocess.run(['node',str(ROOT/'candidate.mjs')],env={**os.environ,'HIDI_CANDIDATE_WEB':web},check=True,timeout=240)
    save('tests.json',{'passed':True,'actualCandidateSqlServer':True,'actualRuntimeCallbackProxy':True,'noLiveSends':True})
def stage(data):
    staged=copy.deepcopy(data);env=staged['properties']['template']['containers'][0].setdefault('env',[])
    settings={'WHATSAPP_CHATBOT_ENABLED':'false','WHATSAPP_CHATBOT_PROVIDER':'msg91','MSG91_WHATSAPP_INTEGRATED_NUMBER':'917093709353'}
    env[:]=[v for v in env if v['name'] not in settings]
    env.extend({'name':key,'value':value} for key,value in settings.items())
    return staged
def apply():
    assert read('tests.json')['passed'];original=old();helper.unchanged(original);targets={}
    for kind in ['api','web']:
        report=read(kind+'-preservation.json');tag=report['candidateTag'];subprocess.run(['docker','push',tag],check=True)
        inspected=json.loads(images.docker('image','inspect',tag))[0];assert inspected['Id']==report['imageId']
        digest=next(v for v in inspected['RepoDigests'] if v.startswith(images.REGISTRY+'/hidi-'+kind+'@'))
        targets['hidi-'+kind]=digest
    helper.guard.install_interrupt_handler();current=dict(original)
    try:
        current['hidi-api']=helper.write(current['hidi-api'],targets['hidi-api'],'whatsappapi'+RUN,restore=stage(current['hidi-api']))
        helper.unchanged(current)
        current['hidi-web']=helper.write(current['hidi-web'],targets['hidi-web'],'whatsappweb'+RUN)
        for route in ['/health','/api/store/health/ready','/','/cart','/checkout','/account']:cloud.get(route)
        import urllib.request,urllib.error
        request=urllib.request.Request(cloud.BASE+'/api/store/whatsapp/msg91/webhook',data=b'{}',headers={'content-type':'application/json','x-hidi-whatsapp-token':'release-invalid-token-no-message-1234567890'},method='POST')
        try:urllib.request.urlopen(request,timeout=20);raise AssertionError('Invalid token accepted')
        except urllib.error.HTTPError as error:assert error.code==401,'Callback route not installed'
        source="""(async()=>{const {Msg91WhatsAppService}=await import('/app/apps/api/dist/whatsapp/msg91.service.js');const c=new Msg91WhatsAppService(null).configuration();console.log('HIDI_DELIVERY_RESULT::'+JSON.stringify({passed:!c.enabled&&c.sender==='917093709353',moduleInstalled:true,enabled:c.enabled,senderMatches:c.sender==='917093709353',authConfigured:!!c.authkey}));})().catch(()=>console.log('HIDI_DELIVERY_RESULT::'+JSON.stringify({passed:false,code:'MODULE_CHECK_FAILED'})));"""
        proof=helper.console.run(current['hidi-api'],source);save('live.json',proof)
        helper.unchanged(current);save('after.json',{'passed':True,'orderingEnabled':False,'states':{name:cloud.snapshot(data) for name,data in current.items()}})
        print('PASS: MSG91 ordering deployed disabled; public callback authenticated; retained checkout and health routes verified')
    except BaseException:
        for name in ['hidi-web','hidi-api']:
            marker=PRIVATE/(name+'-attempt.json')
            if not marker.exists():continue
            attempted=json.loads(marker.read_text());value=cloud.app(name);state=cloud.snapshot(value)
            if state['image']==attempted['image'] and state['latest']==name+'--'+attempted['suffix'] and state['settingsHash']==attempted['settingsHash']:
                helper.write(value,cloud.snapshot(original[name])['image'],'warollback'+name[-3:]+RUN,restore=original[name])
                print('Restored owned '+name+' image and settings')
            elif state!=cloud.snapshot(original[name]):print('Independent state change; refusing to overwrite '+name)
        raise
if __name__=='__main__':
    try:{'prepare':prepare,'test':test,'apply':apply}[sys.argv[1]]()
    except Exception as error:
        print(str(error) if isinstance(error,(AssertionError,cloud.AzureOperationError)) else 'WhatsApp release stopped; inspect sanitized evidence',file=sys.stderr);sys.exit(1)
