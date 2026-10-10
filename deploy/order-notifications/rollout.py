"""Install a disabled notification module with image backup and automatic owned-image rollback."""
import importlib.util, json, os, re, sys
from pathlib import Path
spec=importlib.util.spec_from_file_location('privacy_rollout','deploy/privacy-policy/rollout.py')
base=importlib.util.module_from_spec(spec);spec.loader.exec_module(base)
PRIVATE='order-notifications-private'
def image_patch(data,image,suffix): return base.image_patch(data,image,suffix)
def wait_ready(image,suffix):
    import time
    for attempt in range(60):
        data=base.app('hidi-api');state=base.snapshot(data)
        if state['image']==image and state['latest']==state['ready']=='hidi-api--'+suffix:return data
        time.sleep(5)
    raise RuntimeError('API candidate did not become ready')
def write_image(data,image,suffix):
    path=Path(os.environ['RUNNER_TEMP'])/PRIVATE/'api-image-patch.json'
    path.write_text(json.dumps(image_patch(data,image,suffix)));path.chmod(0o600)
    protected=[e.get('value') for e in data['properties']['template']['containers'][0].get('env',[])]
    try:base.azure('rest','--method','patch','--url','https://management.azure.com'+data['id']+'?api-version='+base.API_VERSION,'--body','@'+str(path),redact=protected)
    finally:path.unlink(missing_ok=True)
def assert_disabled(data):
    values={e['name']:e.get('value') for e in data['properties']['template']['containers'][0].get('env',[])}
    assert values.get('ORDER_NOTIFICATIONS_ENABLED') in (None,'','false'), 'Live notification activation requires separate verified database/provider setup'
def capture():
    work=Path(os.environ['RUNNER_TEMP'])/PRIVATE;work.mkdir(mode=0o700,exist_ok=True)
    Path('evidence').mkdir(exist_ok=True)
    states={}
    for name in ['hidi-api','hidi-web']:
        data=base.app(name);state=base.snapshot(data);base.ready(state)
        assert re.fullmatch('acrhidiprod0927.azurecr.io/hidi-(api|web)@sha256:[0-9a-f]{64}',state['image'])
        if name=='hidi-api':assert_disabled(data)
        path=work/(name+'.json');path.write_text(json.dumps(data));path.chmod(0o600)
        states[name]=state
    Path('evidence/notification-before.json').write_text(json.dumps(states,indent=2))
    with open(os.environ['GITHUB_ENV'],'a') as env:env.write('EXPECTED_API='+states['hidi-api']['image']+'\n')
    print('Captured ready API and web rollback digests; notification activation remains disabled')
def deploy(candidate):
    assert re.fullmatch('acrhidiprod0927.azurecr.io/hidi-api@sha256:[0-9a-f]{64}',candidate)
    old={name:json.loads((Path(os.environ['RUNNER_TEMP'])/PRIVATE/(name+'.json')).read_text()) for name in ['hidi-api','hidi-web']}
    before={name:base.snapshot(data) for name,data in old.items()}
    for name in old:assert base.snapshot(base.app(name))==before[name], 'Live '+name+' changed during preparation; refusing to overwrite it'
    changed=False
    try:
        suffix='notify'+os.environ['GITHUB_RUN_ID'];changed=True
        write_image(old['hidi-api'],candidate,suffix)
        state=base.snapshot(wait_ready(candidate,suffix))
        assert state['settingsHash']==before['hidi-api']['settingsHash'],'Protected API settings changed'
        base.get('/api/store/health/ready');base.get('/health');base.get('/')
        for path in ['/account','/cart','/collections/all','/admin/packing-scanner']:base.get(path)
        # Verify the new endpoint is protected; never send a customer message in a deployment smoke test.
        base.get('/api/store/admin/order-notifications',401)
        after={name:base.snapshot(base.app(name)) for name in old}
        assert after['hidi-web']==before['hidi-web'],'Web changed independently'
        assert after['hidi-api']['image']==candidate and after['hidi-api']['settingsHash']==before['hidi-api']['settingsHash']
        assert_disabled(base.app('hidi-api'))
        Path('evidence/notification-after.json').write_text(json.dumps({'states':after,'disabledPendingProviderAndSqlBackup':True,'existingSettingsPreserved':True,'webUnchanged':True,'publicSmokePassed':True},indent=2))
        print('Notification module installed disabled; API healthy, checkout/payment configuration and storefront preserved')
    except BaseException:
        current=base.app('hidi-api');state=base.snapshot(current)
        if changed and state['image']==candidate and state['settingsHash']==before['hidi-api']['settingsHash']:
            suffix='notifyrollback'+os.environ['GITHUB_RUN_ID'];write_image(current,before['hidi-api']['image'],suffix);wait_ready(before['hidi-api']['image'],suffix)
            print('Candidate verification failed; owned API image rolled back',file=sys.stderr)
        else:print('Original or independently changed API preserved; no unsafe rollback',file=sys.stderr)
        raise
if __name__=='__main__':
    try:
        if sys.argv[1]=='capture':capture()
        else:deploy(sys.argv[2])
    except BaseException as error:
        print(str(error) if isinstance(error,(AssertionError,base.AzureOperationError)) else 'Notification rollout stopped; inspect sanitized evidence',file=sys.stderr)
        sys.exit(1)
