"""Compare the backed-up live baseline; update only our web image, with owned rollback."""
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import sys
import urllib.request
import urllib.error

here=Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location('guard',here.parent/'privacy-policy/rollout.py');guard=importlib.util.module_from_spec(spec);spec.loader.exec_module(guard)
EXPECTED={
 'hidi-web':{'image':'acrhidiprod0927.azurecr.io/hidi-web@sha256:800ccb5374a9cc8a46d268c86e57221af9150bd9671b6d5c749fad3a39b873ed','settingsHash':'6e35086102307a61b9d4f308496e3ebf8f1ffbe49b07953f63a1d883e4818a44'},
 'hidi-api':{'image':'acrhidiprod0927.azurecr.io/hidi-api@sha256:69d4c89fd6531658eba730b7254b7d34c9a274953e2fed4b46ce22caa13e56e6','settingsHash':'e2b3c06d5ffbea15ec506c9ede1b67a0e44cf7f3f5e46f5ef893cab76d582c8b'},
}
PUBLIC=['/api/hidi/privacy-policy','/privacy','/api/hidi/hero-config','/api/hidi/landing-media-config','/config.js']

def stable_public():
    result={}
    for path in PUBLIC:
        body=guard.get(path,headers={'Cache-Control':'no-cache'})
        if path.startswith('/api/'):
            body=json.dumps(json.loads(body),sort_keys=True,separators=(',',':')).encode()
        result[path]=hashlib.sha256(body).hexdigest()
    assert json.loads(guard.get('/api/hidi/privacy-policy')).get('published') is True, 'Previously published policy must remain live'
    return result

def assert_public(expected, message):
    actual=stable_public()
    changed=[path for path in PUBLIC if actual.get(path)!=expected.get(path)]
    Path('evidence/public-content-check.json').write_text(json.dumps({'hashes':actual,'changedPaths':changed},indent=2))
    assert not changed, message+': '+', '.join(changed)

def verify_live():
    for path in ['/health','/healthz','/collections/all','/cart','/account','/wishlist','/checkout','/admin','/admin/landing-media','/admin/packing-scanner','/admin/privacy-policy']:
        guard.get(path)
    for path in ['/api/hidi/privacy-policy/admin','/api/hidi/privacy-policy/admin/preview','/api/admin/session']:
        guard.get(path,401)
    for path in ['/','/collections/all']:
        with urllib.request.urlopen(urllib.request.Request(guard.BASE+path,headers={'Accept-Encoding':'gzip','Cache-Control':'no-cache'}),timeout=30) as response:
            assert response.status==200
            assert response.headers.get('Content-Encoding') in ['gzip','br'], 'HTML compression missing on '+path
            assert 'accept-encoding' in response.headers.get('Vary','').lower()
            if path!='/':assert response.headers.get('Server-Timing'), 'Proxy timing missing'
    guard.get('/api/hidi/performance',405)

def main():
    work=Path(os.environ['RUNNER_TEMP'])/'performance-private';work.mkdir(exist_ok=True,mode=0o700)
    evidence=Path('evidence');evidence.mkdir(exist_ok=True)
    if sys.argv[1]=='capture':
        states={}
        for name,expected in EXPECTED.items():
            data=guard.app(name);state=guard.snapshot(data);guard.ready(state)
            assert all(state[key]==value for key,value in expected.items()), 'Live '+name+' changed after backup; refusing to overwrite a newer release'
            file=work/(name+'.json');file.write_text(json.dumps(data));file.chmod(0o600);states[name]=state
        public=stable_public();(work/'public.json').write_text(json.dumps(public))
        (evidence/'public-content-before.json').write_text(json.dumps(public,indent=2))
        (evidence/'performance-before.json').write_text(json.dumps(states,indent=2));print('PASS: backed-up web/API/settings and published privacy/media preserved baseline')
        return
    candidate=sys.argv[2];assert candidate.startswith('acrhidiprod0927.azurecr.io/hidi-web@sha256:')
    old={name:json.loads((work/(name+'.json')).read_text()) for name in EXPECTED}
    baseline={name:guard.snapshot(data) for name,data in old.items()}
    public=json.loads((work/'public.json').read_text())
    for name,state in baseline.items():assert guard.snapshot(guard.app(name))==state, 'Live drift while preparing candidate'
    assert_public(public,'Published policy, media or social configuration changed independently')
    changed=False
    try:
        changed=True;suffix='perf'+os.environ['GITHUB_RUN_ID'];guard.write_image(old['hidi-web'],candidate,suffix)
        state=guard.snapshot(guard.wait_ready(candidate,suffix));assert state['settingsHash']==baseline['hidi-web']['settingsHash']
        assert guard.snapshot(guard.app('hidi-api'))==baseline['hidi-api'], 'API drift'
        verify_live();assert_public(public,'Published policy, media or social configuration changed')
        subprocess=__import__('subprocess');subprocess.run(['node','deploy/performance/live-check.mjs'],check=True)
        after={name:guard.snapshot(guard.app(name)) for name in baseline};guard.ready(after['hidi-web'])
        assert after['hidi-web']['image']==candidate and after['hidi-web']['settingsHash']==baseline['hidi-web']['settingsHash']
        assert after['hidi-api']==baseline['hidi-api']
        report={'passed':True,'states':after,'publicPolicyMediaSocialHashesPreserved':True,'backupRun':38020864167,'rollbackImage':baseline['hidi-web']['image']}
        (evidence/'performance-after.json').write_text(json.dumps(report,indent=2));print('PASS: verified performance image deployed; API/settings/published policy/media/social retained')
    except Exception:
        if changed:
            data=guard.app('hidi-web');current=guard.snapshot(data)
            if current['image']==candidate and current['settingsHash']==baseline['hidi-web']['settingsHash']:
                suffix='perfrb'+os.environ['GITHUB_RUN_ID'];guard.write_image(data,baseline['hidi-web']['image'],suffix);guard.wait_ready(baseline['hidi-web']['image'],suffix)
                print('Candidate failed verification; exact previous web image restored',file=sys.stderr)
            elif current['image']==baseline['hidi-web']['image']:print('Previous image remains active',file=sys.stderr)
            else:print('Independent live drift; refusing rollback over another release',file=sys.stderr)
        raise

if __name__=='__main__':
    try:main()
    except Exception as error:
        print(str(error) if isinstance(error,(AssertionError,guard.AzureOperationError)) else 'Performance gate stopped; production not certified',file=sys.stderr);sys.exit(1)
