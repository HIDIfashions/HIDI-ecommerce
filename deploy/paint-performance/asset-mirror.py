"""Publish public immutable bytes to an isolated, strictly Free static site.

No domain, existing application, credentials, API or database is changed. Older
content-addressed files are retained, so rejected candidates cannot break a live
version. The browser always retains the existing same-origin asset as fallback.
"""
import hashlib,json,os,re,subprocess,time,urllib.request,urllib.error
from pathlib import Path

NAME='hidi-performance-assets'
GROUP='rg-hidi-prod'
OWNER='paint-performance-release'
ASSET=re.compile(r'^/(?:assets/(?:index-[a-f0-9]{16}\.js|style-[a-f0-9]{16}\.css)|media-performance/assets/(?:poster-[a-f0-9]{16}\.avif|hero-av1-[a-f0-9]{16}-\d+\.mp4))$')
LIMIT=100*1024*1024
def sha(data):return hashlib.sha256(data).hexdigest()
def validate_files(files):
    assert isinstance(files,dict) and 0<len(files)<=128,'Unexpected mirror inventory'
    for path,digest in files.items():
        assert ASSET.fullmatch(path) and re.fullmatch('[a-f0-9]{64}',digest) and digest[:16] in path,'Mirror assets must be content-addressed public files'

def az(*args):return json.loads(subprocess.check_output(['az',*args,'--only-show-errors','-o','json'],text=True))
def preflight():
    """Read-only access/ownership check; never provision or request deployment secrets."""
    try:
        site=az('staticwebapp','show','-g',GROUP,'-n',NAME)
    except subprocess.CalledProcessError as error:
        raise RuntimeError(
            'Asset mirror is unavailable to the deployment identity. An Azure owner must '
            'provision/verify the isolated Free hidi-performance-assets site in rg-hidi-prod '
            'and grant access scoped to that site. No deployment or asset publication was attempted.'
        ) from error
    assert site['sku']['name']=='Free' and site['sku']['tier']=='Free','Refuse a paid asset site'
    assert site.get('tags',{}).get('hidi-owner')==OWNER and site.get('tags',{}).get('hidi-purpose')=='immutable-assets','Refuse an unrelated asset site'
    assert not site.get('repositoryUrl'),'Refuse a source-controlled asset site'
    assert re.fullmatch(r'[a-z0-9-]+(?:\.\d+)?\.azurestaticapps\.net',site['defaultHostname'])
    return {'passed':True,'resource':NAME,'group':GROUP,'sku':'Free','readOnly':True,
            'secretsRead':False,'productionChanges':False}

def get(url):
    request=urllib.request.Request(url,headers={'Accept-Encoding':'identity','Cache-Control':'no-cache'})
    with urllib.request.urlopen(request,timeout=45) as response:return response.read(),response.headers

def verify_edge(proof):
    if 'edgeOrigin' not in proof and 'edgeFiles' not in proof:return
    assert proof.get('edgeOrigin')=='https://hidi-performance-posters.pages.dev','Unexpected edge host'
    files=proof.get('edgeFiles');assert isinstance(files,dict) and files,'Missing verified edge files';validate_files(files)
    for path,digest in files.items():
        assert proof['files'].get(path)==digest,'Edge content must match current immutable files'
        request=urllib.request.Request(proof['edgeOrigin']+path,headers={'Accept-Encoding':'identity','User-Agent':'HIDI-Performance-Validation/1.0 (+https://hidiindia.com)'})
        with urllib.request.urlopen(request,timeout=45) as response:data=response.read();headers=response.headers
        assert sha(data)==digest,'Edge asset bytes changed'
        expected='video/mp4' if path.endswith('.mp4') else 'image/avif' if path.endswith('.avif') else 'text/css' if path.endswith('.css') else 'javascript'
        assert expected in headers.get('Content-Type','') and 'immutable' in headers.get('Cache-Control','') and headers.get('Access-Control-Allow-Origin')=='*','Edge delivery headers changed'
        if path.endswith('.avif'):assert 'noindex' not in headers.get('X-Robots-Tag','').lower()

def attach_edge(proof):
    config=Path(__file__).with_name('edge-assets.json')
    if config.exists():
        source=json.loads(config.read_text());validate_files(source['files']);assert source['origin']=='https://hidi-performance-posters.pages.dev'
        files={path:digest for path,digest in source['files'].items() if proof['files'].get(path)==digest}
        # A new app/style/media hash absent from this public deployment stays on
        # Azure. Never reuse an older file or invent availability on the edge.
        if files:proof.update(edgeOrigin=source['origin'],edgeFiles=files);verify_edge(proof)
    return proof

def publish(overlay,report,manifest,private,out):
    # Exact resource reads work with the approved site-only role. No group listing or creation.
    site=az('staticwebapp','show','-g',GROUP,'-n',NAME)
    assert site['sku']['name']=='Free' and site['sku']['tier']=='Free','Never create or upgrade to a paid plan'
    assert site.get('tags',{}).get('hidi-owner')==OWNER and site.get('tags',{}).get('hidi-purpose')=='immutable-assets','Refuse to alter another static site'
    assert not site.get('repositoryUrl'),'Asset mirror must have no source-control deployment integration'
    host=site['defaultHostname'];assert re.fullmatch(r'[a-z0-9-]+(?:\.\d+)?\.azurestaticapps\.net',host)
    origin='https://'+host
    files={}
    paths=['/'+report['bundle']]
    style_manifest=overlay/'paint-performance/style-assets.json'
    if style_manifest.exists():
        for row in json.loads(style_manifest.read_text())['styles'].values():
            assert re.fullmatch(r'/assets/style-[a-f0-9]{16}\.css',row['url'])
            assert sha((overlay/'dist'/row['url'].lstrip('/')).read_bytes())==row['sha256'],'Generated CSS bytes changed'
            paths.append(row['url'])
    for variants in manifest['videos'].values():
        for kind in ['mobile','desktop']:
            paths.extend([variants[kind]['avifPoster'],variants[kind]['av1Url']])
            if variants[kind].get('avifPosterSmall'):paths.append(variants[kind]['avifPosterSmall'])
    for path in set(paths):
        assert ASSET.fullmatch(path)
        source=(overlay/'dist'/path.lstrip('/'));data=source.read_bytes()
        assert source.resolve().is_relative_to((overlay/'dist').resolve())
        if path.endswith('.js'):assert data.startswith(b'if (!window.__HidiAppStarted) {'),'Mirror entry requires its one-time startup guard'
        files[path]=sha(data)
    validate_files(files)
    current=dict(files);history={}
    try:history=json.loads(get(origin+'/asset-manifest.json')[0])['files'];validate_files(history)
    except urllib.error.HTTPError as error:
        code=error.code;error.close()
        if code!=404:raise
    if all(history.get(path)==digest for path,digest in current.items()):
        # Immutable publication is idempotent. Revalidate every current byte and
        # delivery header before reusing it; do not retrieve a token or rewrite history.
        checks=[];total=0
        for path,digest in current.items():
            data,headers=get(origin+path)
            assert sha(data)==digest,'Existing immutable mirror bytes changed'
            assert 'immutable' in headers.get('Cache-Control','') and headers.get('Access-Control-Allow-Origin')=='*'
            expected='video/mp4' if path.endswith('.mp4') else 'image/avif' if path.endswith('.avif') else 'text/css' if path.endswith('.css') else 'javascript'
            assert expected in headers.get('Content-Type','')
            total+=len(data);assert total<LIMIT
            checks.append({'path':path,'sha256':digest,'bytes':len(data),'mime':headers.get('Content-Type')})
        proof={'passed':True,'bootOnce':True,'origin':origin,'files':current,'sku':'Free','resource':NAME,'checks':checks,'retainedPreviousFiles':len(history),'totalPublicBytes':total,'dnsChanged':False,'existingAppsChanged':False,'reusedPublication':True,'historyRetainedWithoutRewrite':True}
        attach_edge(proof)
        (overlay/'paint-performance/asset-mirror.json').write_text(json.dumps(proof))
        (out/'asset-mirror.json').write_text(json.dumps(proof,indent=2))
        return proof
    package=private/'asset-site';package.mkdir()
    total=0
    for path,digest in history.items():
        if path in files:assert files[path]==digest;continue
        data,_=get(origin+path);assert sha(data)==digest,'Previous mirror content changed'
        target=package/path.lstrip('/');target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(data)
        total+=len(data);assert total<LIMIT;files[path]=digest
    for path,digest in current.items():
        data=(overlay/'dist'/path.lstrip('/')).read_bytes();assert sha(data)==digest
        target=package/path.lstrip('/');target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(data)
        total+=len(data);assert total<LIMIT
    validate_files(files)
    (package/'asset-manifest.json').write_text(json.dumps({'files':files,'sourceSha':os.environ['GITHUB_SHA']}))
    (package/'index.html').write_text('<!doctype html><meta name="robots" content="noindex"><title>HIDI immutable assets</title>')
    immutable={'Cache-Control':'public,max-age=31536000,immutable'}
    config={'routes':[{'route':'/asset-manifest.json','headers':{'Cache-Control':'no-store'}},{'route':'/assets/*','headers':immutable},{'route':'/media-performance/assets/*','headers':immutable}],
        'globalHeaders':{'Access-Control-Allow-Origin':'*','X-Content-Type-Options':'nosniff','X-Robots-Tag':'noindex'},
        'mimeTypes':{'.avif':'image/avif','.mp4':'video/mp4','.js':'text/javascript','.css':'text/css'}}
    (package/'staticwebapp.config.json').write_text(json.dumps(config))
    token=az('staticwebapp','secrets','list','-g',GROUP,'-n',NAME)['properties']['apiKey'];assert isinstance(token,str) and len(token)>40
    print('::add-mask::'+token,flush=True)
    environment={**os.environ,'SWA_CLI_DEPLOYMENT_TOKEN':token,'SWA_CLI_TELEMETRY_DISABLED':'1'}
    subprocess.run(['node','/tmp/media-tools/node_modules/@azure/static-web-apps-cli/dist/cli/bin.js','deploy',str(package),'--env','production','--no-use-keychain'],env=environment,check=True,timeout=600)
    checks=[]
    for path,digest in files.items():
        last=None
        for attempt in range(12):
            try:
                data,headers=get(origin+path);assert sha(data)==digest,'Published mirror hash mismatch'
                assert 'immutable' in headers.get('Cache-Control','') and headers.get('Access-Control-Allow-Origin')=='*'
                expected='video/mp4' if path.endswith('.mp4') else 'image/avif' if path.endswith('.avif') else 'text/css' if path.endswith('.css') else 'javascript'
                assert expected in headers.get('Content-Type','')
                checks.append({'path':path,'sha256':digest,'bytes':len(data),'mime':headers.get('Content-Type')});break
            except (urllib.error.URLError,AssertionError) as error:last=error;time.sleep(5)
        else:raise AssertionError('Mirror publication did not become healthy: '+path) from last
    proof={'passed':True,'bootOnce':True,'origin':origin,'files':current,'sku':'Free','resource':NAME,'checks':checks,'retainedPreviousFiles':len(history),'totalPublicBytes':total,'dnsChanged':False,'existingAppsChanged':False}
    attach_edge(proof)
    (overlay/'paint-performance/asset-mirror.json').write_text(json.dumps(proof))
    (out/'asset-mirror.json').write_text(json.dumps(proof,indent=2))
    return proof

def verify(proof):
    assert proof['passed'] and proof['bootOnce'] and proof['sku']=='Free' and not proof['dnsChanged'] and not proof['existingAppsChanged']
    assert re.fullmatch(r'https://[a-z0-9-]+(?:\.\d+)?\.azurestaticapps\.net',proof['origin'])
    validate_files(proof['files'])
    verify_edge(proof)
    for path,digest in proof['files'].items():
        data,headers=get(proof['origin']+path)
        assert sha(data)==digest and 'immutable' in headers.get('Cache-Control','') and headers.get('Access-Control-Allow-Origin')=='*','Mirror changed after preparation'
        if path.endswith('.css'):assert 'text/css' in headers.get('Content-Type',''),'Verified stylesheet MIME changed'

if __name__=='__main__':
    import sys
    assert sys.argv[1:]==['preflight'],'Only read-only preflight is available directly'
    print(json.dumps(preflight()))
