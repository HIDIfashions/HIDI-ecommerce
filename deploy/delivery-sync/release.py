"""Compose, validate and release minimal overlays against freshly captured live images."""
import copy, importlib.util, json, os, pathlib, shutil, subprocess, sys, time
ROOT=pathlib.Path(__file__).resolve().parent
def load(name,path):
    spec=importlib.util.spec_from_file_location(name,path); m=importlib.util.module_from_spec(spec); spec.loader.exec_module(m); return m
guard=load('delivery_guard',ROOT.parent/'range-five/release.py')
cloud,images,preserve=guard.cloud,guard.images,guard.preserve
cloud.API_VERSION='2025-07-01'; cloud.BASE='https://hidiindia.com'
console=load('delivery_console',ROOT/'console.py')
PRIVATE=pathlib.Path(os.environ['RUNNER_TEMP'])/'delivery-release'
EVIDENCE=pathlib.Path('evidence/delivery-release')
RUN=os.environ['GITHUB_RUN_ID']+'a'+os.environ.get('GITHUB_RUN_ATTEMPT','1')
def save(name,data):
    EVIDENCE.mkdir(parents=True,exist_ok=True); (EVIDENCE/name).write_text(json.dumps(data,indent=2))
def read(name): return json.loads((EVIDENCE/name).read_text())
def originals(): return json.loads((PRIVATE/'originals.json').read_text())
def unchanged(expected):
    for name,data in expected.items(): assert cloud.snapshot(cloud.app(name))==cloud.snapshot(data),'Production changed independently: '+name
def prepare():
    PRIVATE.mkdir(mode=0o700); old={name:cloud.app(name) for name in ['hidi-api','hidi-web']}
    for data in old.values(): cloud.ready(cloud.snapshot(data))
    (PRIVATE/'originals.json').write_text(json.dumps(old)); (PRIVATE/'originals.json').chmod(0o600)
    save('before.json',{name:cloud.snapshot(data) for name,data in old.items()})
    readiness=console.run(old['hidi-api'],(ROOT/'inspect.mjs').read_text())
    assert readiness['productionTracking'] and readiness['tokenPresent'] and not readiness['currentlyEnabled']
    assert {'SELECT','INSERT','UPDATE'} <= set(readiness['permissions'])
    assert old['hidi-api']['properties']['template'].get('scale',{}).get('minReplicas',0)>=1,'Scheduler needs an always-on API replica'
    save('readiness.json',readiness)
    for app in ['api','web']:
        name='hidi-'+app; image=cloud.snapshot(old[name])['image']; images.validate_image(image,app)
        subprocess.run(['docker','pull',image],check=True)
        # Preserve the exact baseline manifest under a release-specific rollback tag.
        backup=images.REGISTRY+'/'+name+':delivery-backup-'+RUN
        subprocess.run(['docker','buildx','imagetools','create','--tag',backup,image],check=True)
        folder=PRIVATE/app; folder.mkdir(); base=folder/'base'; overlay=folder/'overlay'; candidate=folder/'candidate'
        images.extract(image,base)
        if app=='api':
            result=subprocess.run(['node',str(ROOT/'patch-api.mjs'),str(base),str(overlay)],capture_output=True,text=True)
            if result.returncode: print(result.stderr);result.check_returncode()
            patch=json.loads(result.stdout)
        else:
            patch=load('delivery_web_patch',ROOT/'patch-web.py').patch_runtime(base,overlay)
        save(app+'-patch.json',patch)
        tag=images.REGISTRY+'/'+name+':delivery-'+RUN
        (folder/'Dockerfile').write_text('FROM '+image+'\nCOPY --chown=node:node overlay/ /app/\n')
        subprocess.run(['docker','build','--pull=false','-t',tag,str(folder)],check=True)
        images.extract(tag,candidate)
        result=preserve.verify(base,candidate,overlay,set(patch['allowedFiles']),json.loads(images.docker('image','inspect',image,tag)))
        result.update({'baseImage':image,'candidateTag':tag,'imageId':json.loads(images.docker('image','inspect',tag))[0]['Id'],'backup':backup})
        save(app+'-preservation.json',result)
    unchanged(old)
    print('PASS: minimal candidates built; unrelated runtime files and original image layers preserved',flush=True)
def test():
    tag=read('api-preservation.json')['candidateTag']
    command=['docker','run','--rm','--network','host','--entrypoint','node','-e','TRACKING_TEST_SQL_HOST=127.0.0.1','-e','TRACKING_TEST_SQL_PASSWORD='+os.environ['TRACKING_TEST_SQL_PASSWORD'],
        '-v',str(pathlib.Path('tests').resolve())+':/app/tests:ro','-v',str(pathlib.Path('apps/api/prisma').resolve())+':/app/apps/api/prisma:ro',tag,'/app/tests/delhivery-sync.sqlserver.mjs']
    subprocess.run(command,check=True,timeout=180)
    env={**os.environ,'HIDI_CANDIDATE_WEB':read('web-preservation.json')['candidateTag'],'HIDI_BASELINE_WEB':read('web-preservation.json')['baseImage']}
    subprocess.run(['node','tests/delhivery-sync.browser.mjs'],env=env,check=True,timeout=240)
    save('candidate-tests.json',{'passed':True,'actualRetainedImages':True,'sqlServer':True,'desktopMobile':True,'independentCod':True})
def publish():
    assert read('candidate-tests.json')['passed']; unchanged(originals()); targets={}
    for app in ['api','web']:
        report=read(app+'-preservation.json'); tag=report['candidateTag']; subprocess.run(['docker','push',tag],check=True)
        inspected=json.loads(images.docker('image','inspect',tag))[0]
        assert inspected['Id']==report['imageId']
        digest=next(x for x in inspected['RepoDigests'] if x.startswith(images.REGISTRY+'/hidi-'+app+'@'))
        subprocess.run(['docker','pull',digest],check=True)
        assert json.loads(images.docker('image','inspect',digest))[0]['Id']==report['imageId']
        targets['hidi-'+app]=digest
    save('published.json',targets)
def write(expected,image,suffix,enable=None,restore=None):
    url='https://management.azure.com'+expected['id']+'?api-version='+cloud.API_VERSION; token=guard.arm_token()
    current,etag,_,_,_=guard.arm_request('GET',url,token)
    assert cloud.snapshot(current)==cloud.snapshot(expected),'Production changed before write'
    body=cloud.image_patch(current,image,suffix)
    if restore is not None: body['properties']['template']['containers']=copy.deepcopy(restore['properties']['template']['containers'])
    elif enable is not None:
        entries=body['properties']['template']['containers'][0].setdefault('env',[])
        entries[:]=[item for item in entries if item['name']!='DELHIVERY_SYNC_ENABLED']
        entries.append({'name':'DELHIVERY_SYNC_ENABLED','value':'true' if enable else 'false'})
    desired=copy.deepcopy(current);desired['properties']['template'].update(body['properties']['template'])
    wanted=cloud.snapshot(desired)['settingsHash']
    # Record ownership before the request so a lost response can still be reconciled.
    (PRIVATE/(current['name']+'-attempt.json')).write_text(json.dumps({'image':image,'suffix':suffix,'settingsHash':wanted}))
    _,_,operation,_,retry=guard.arm_request('PATCH',url,token,body=body,etag=etag or current.get('etag'))
    guard.wait_arm_operation(operation,token,retry)
    deadline=time.monotonic()+600
    while time.monotonic()<deadline:
        value=cloud.app(current['name']);state=cloud.snapshot(value)
        assert state['settingsHash']==wanted,'Unexpected settings change'
        if state['image']==image and state['latest']==state['ready']==current['name']+'--'+suffix: return value
        time.sleep(5)
    raise AssertionError('Revision did not become ready')
def apply():
    old=originals();unchanged(old); targets=read('published.json');current=dict(old)
    guard.install_interrupt_handler()
    try:
        current['hidi-api']=write(current['hidi-api'],targets['hidi-api'],'deliveryapi'+RUN,False)
        unchanged(current)
        current['hidi-web']=write(current['hidi-web'],targets['hidi-web'],'deliveryweb'+RUN)
        for route in ['/health','/api/store/health/ready','/','/cart','/checkout','/admin/orders','/admin/packing-scanner']:
            cloud.get(route)
        cloud.get('/api/admin/orders?status=SHIPPED',401)
        unchanged(current)
        current['hidi-api']=write(current['hidi-api'],targets['hidi-api'],'deliveryon'+RUN,True)
        result=console.run(current['hidi-api'],(ROOT/'verify-live.mjs').read_text(),timeout=240)
        save('live-verification.json',result)
        assert result['enabled'] and result['intervalHours']==6 and result['failed']==0
        unchanged(current)
        save('after.json',{'passed':True,'sixHourDeliveryAndCodEnabled':True,'states':{name:cloud.snapshot(data) for name,data in current.items()}})
        print('PASS: production delivery and separate COD reconciliation enabled every six hours',flush=True)
    except BaseException:
        for name in ['hidi-api','hidi-web']:
            marker=PRIVATE/(name+'-attempt.json')
            if not marker.exists():continue
            try:
                attempt=json.loads(marker.read_text()); value=cloud.app(name);state=cloud.snapshot(value)
                if state['image']==attempt['image'] and state['latest']==name+'--'+attempt['suffix'] and state['settingsHash']==attempt['settingsHash']:
                    write(value,cloud.snapshot(old[name])['image'],'deliveryrollback'+name[-3:]+RUN,restore=old[name])
                    print('Restored owned '+name+' runtime and settings; verified order records retained',flush=True)
                elif state!=cloud.snapshot(old[name]): print('Independent state change: refusing to overwrite '+name,flush=True)
            except BaseException: print('Rollback needs attention for '+name,flush=True)
        raise
if __name__=='__main__':
    try: {'prepare':prepare,'test':test,'publish':publish,'apply':apply}[sys.argv[1]]()
    except Exception as error:
        print(str(error) if isinstance(error,(AssertionError,cloud.AzureOperationError)) else 'Delivery release stopped; inspect sanitized evidence',file=sys.stderr);sys.exit(1)
