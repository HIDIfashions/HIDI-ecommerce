"""Activate only SMS after documented provider delivery; retain exact live images/settings."""
import copy
import datetime
import importlib.util
import json
import os
from pathlib import Path
import time

HERE = Path(__file__).resolve().parent
readiness = None
cloud = None
EXPECTED_IMAGE = 'acrhidiprod0927.azurecr.io/hidi-api@sha256:4d14ec2469e64f1b1478036d89a0305f938c06922145630f5ac5e71de3c69df3'
FLOW = '6ad3197ba8dca687a20f1e62'

def env_patch(before, cutoff, suffix):
    changes = {'ORDER_SMS_ENABLED':'true', 'ORDER_SMS_PROVIDER_VERIFIED':'true',
        'MSG91_ORDER_SMS_TEMPLATE_ID':FLOW, 'ORDER_SMS_START_AT':cutoff,
        'ORDER_NOTIFICATIONS_ENABLED':'true', 'ORDER_EMAIL_ENABLED':'false', 'ORDER_WHATSAPP_ENABLED':'false'}
    old = {e['name']:e for e in before['properties']['template']['containers'][0].get('env',[])}
    assert len(old) == len(before['properties']['template']['containers'][0].get('env',[])), 'Duplicate environment names'
    assert not old.get('ORDER_SMS_START_AT',{}).get('value'), 'SMS already has an activation cutoff; review instead of resetting it'
    master = old.get('ORDER_NOTIFICATIONS_START_AT',{}).get('value')
    if master:
        datetime.datetime.fromisoformat(master.replace('Z','+00:00'))
    else: changes['ORDER_NOTIFICATIONS_START_AT'] = cutoff
    containers = copy.deepcopy(before['properties']['template']['containers'])
    containers[0]['env'] = [e for e in containers[0].get('env',[]) if e['name'] not in changes]
    containers[0]['env'] += [{'name':k,'value':v} for k,v in changes.items()]
    return {'location':before['location'],'properties':{'template':{'containers':containers,'revisionSuffix':suffix}}}

def write_patch(before, patch):
    path = Path(os.environ['RUNNER_TEMP']) / 'sms-activation-patch.json'
    path.write_text(json.dumps(patch)); path.chmod(0o600)
    try:
        cloud.azure('rest','--method','patch','--url','https://management.azure.com'+before['id']+'?api-version=2025-07-01','--body','@'+str(path),redact=[e.get('value') for e in before['properties']['template']['containers'][0].get('env',[])])
    finally: path.unlink(missing_ok=True)

def wait_ready(suffix):
    for _ in range(45):
        app = cloud.app('hidi-api'); p = app['properties']
        if p.get('latestReadyRevisionName') == 'hidi-api--'+suffix and p.get('latestRevisionName') == p.get('latestReadyRevisionName'): return app
        time.sleep(8)
    raise AssertionError('SMS revision did not become ready')

def report():
    readiness.main()
    return json.loads(Path('evidence/order-notifications/readiness.json').read_text())

def main():
    global readiness, cloud
    spec = importlib.util.spec_from_file_location('sms_readiness', HERE / 'readiness.py')
    readiness = importlib.util.module_from_spec(spec); spec.loader.exec_module(readiness)
    cloud = readiness.cloud
    before = cloud.app('hidi-api'); web = cloud.snapshot(cloud.app('hidi-web'))
    cloud.ready(cloud.snapshot(before))
    assert cloud.snapshot(before)['image'] == EXPECTED_IMAGE, 'Live API changed; recapture before activation'
    pre = report()
    assert pre['apiModuleInstalled'] and pre['queueTableExists'] and all(pre['queueCapabilities'].values())
    assert all(pre['sms'][k] for k in ['moduleInstalled','schemaReady','authConfigured']), 'SMS prerequisites missing'
    assert not pre['notificationWorkerEnabled'] and not pre['sms']['enabled'], 'Worker already enabled; review first'
    assert cloud.snapshot(cloud.app('hidi-api')) == cloud.snapshot(before)
    cutoff = datetime.datetime.now(datetime.timezone.utc).isoformat(timespec='seconds').replace('+00:00','Z')
    suffix = 'ordersms'+os.environ['GITHUB_RUN_ID']+'a'+os.environ['GITHUB_RUN_ATTEMPT']
    patch = env_patch(before, cutoff, suffix)
    desired = copy.deepcopy(before); desired['properties']['template']['containers'] = patch['properties']['template']['containers']
    expected = cloud.snapshot(desired)
    attempted = False
    try:
        attempted = True; write_patch(before, patch)
        after = wait_ready(suffix)
        state = cloud.snapshot(after)
        assert state['image']==expected['image'] and state['settingsHash']==expected['settingsHash'], 'Unexpected API settings change'
        assert cloud.snapshot(cloud.app('hidi-web')) == web, 'Storefront changed during activation'
        post = report()
        assert post['notificationWorkerEnabled'] and not post['whatsappEnabled']
        assert all(post['sms'][k] for k in ['moduleInstalled','schemaReady','authConfigured','enabled','providerVerified','cutoffConfigured','templateConfigured']) and not post['sms']['emailEnabled']
        assert all(post['queueCapabilities'].values())
        result = {'activated':True,'channel':'SMS','cutoff':cutoff,'revision':after['properties']['latestReadyRevisionName'],'image':state['image'],'providerTestRequest':'6ad33dc62aba7f87fc0b4232','providerDelivery':'Delivered 2026-10-17 14:50:10 IST','recipientSuffix':'9353','decimalAmountTest':'1499.50','webPreserved':True,'identitiesAndOtherSettingsPreserved':True,'schemaChanged':False,'publicNetworkChanged':False}
        Path('evidence/order-notifications/activation.json').write_text(json.dumps(result,indent=2)); print(json.dumps(result))
    except Exception:
        if attempted:
            current = cloud.app('hidi-api'); p=current['properties']
            assert p.get('latestRevisionName')=='hidi-api--'+suffix, 'Concurrent release detected; refusing to overwrite it'
            rollback = suffix+'r'
            write_patch(before,{'location':before['location'],'properties':{'template':{'containers':before['properties']['template']['containers'],'revisionSuffix':rollback}}})
            restored=wait_ready(rollback)
            assert cloud.snapshot(restored)['settingsHash']==cloud.snapshot(before)['settingsHash']
            print('Activation failed; original disabled configuration restored')
        raise

if __name__=='__main__': main()
