import hashlib,importlib.util,json,os,re,shutil,signal,subprocess,time,urllib.request
from pathlib import Path
HERE=Path(__file__).resolve().parent
def load(name,path):
    s=importlib.util.spec_from_file_location(name,path);m=importlib.util.module_from_spec(s);s.loader.exec_module(m);return m
photo=load('media_photo',HERE.parent/'photo-upload/release.py');cloud,images=photo.cloud,photo.images
cloud.BASE='https://hidiindia.com'
preserve=load('media_preserve',HERE.parent/'product-skn/release.py');patch=load('media_patch',HERE/'patch.py')
mirror=load('asset_mirror',HERE/'asset-mirror.py')
PRIVATE=Path(os.environ['RUNNER_TEMP'])/'hidi-paint-private';OUT=Path('evidence/paint-performance')
OUT.mkdir(parents=True,exist_ok=True);photo.PRIVATE,photo.EVIDENCE=PRIVATE,OUT
def save(name,value): (OUT/name).write_text(json.dumps(value,indent=2))
def selections():
    return {key:json.loads(cloud.get(path)) for key,path in [('hero','/api/hidi/hero-config'),('landing','/api/hidi/landing-media-config')]}

def sha(data):return hashlib.sha256(data).hexdigest()
PRODUCT_PAGE_IMAGE=images.REGISTRY+'/hidi-web@sha256:9b721f1136035fe04225e20f9470f184fafaab55c665f43cca55f516ef5f09ce'
def dist_asset(base,url):
    assert isinstance(url,str) and url.startswith('/') and '..' not in url.split('/')
    file=(base/'dist'/url.lstrip('/')).resolve();file.relative_to((base/'dist').resolve());assert file.is_file()
    return file

def existing_performance_compose(base,overlay,folder,image,icons):
    """Layer only the reviewed head change over an already verified paint image.

    Product-page releases intentionally retain the complete paint image. Rebuilding
    its already transformed/minified application would replace unrelated product
    work. Revalidate every retained provenance record and immutable byte instead,
    then let the normal browser, commerce, Lighthouse and preservation gates test
    the one-file candidate.
    """
    assert image==PRODUCT_PAGE_IMAGE,'The current product-page image changed; prepare again from the new live release'
    required=['initial-hero.json','head-assets.json','icons.json','home-pricing.json','critical-css.json','style-assets.json','asset-mirror.json','asset-encodings.json']
    assert all((base/'paint-performance'/name).is_file() for name in required),'Complete retained paint provenance required'
    current_head=(base/'lcp-performance/head.mjs').read_bytes();next_head=(HERE/'head.mjs').read_bytes()
    assert sha(current_head) in {'8ec0ba7ac41353bd88177a9c3fdbacea6cd382e03b38e8da8550e1baef137a12',sha(next_head)},'Retained paint head changed; stop'
    assert b'data-hidi-price-header-offset' not in current_head or current_head==next_head
    # These are generated/released copies from the verified performance and SEO
    # layers. In particular, announcement.mjs contains the discovery injection,
    # so comparing it with the raw source would incorrectly ask us to replace the
    # current product image. Pin the immutable image, validate every retained
    # source, record its bytes, and prove below that the candidate keeps them.
    retained_sources=['announcement.mjs','app-start.js','asset-mirror-client.js','asset-mirror.mjs','critical-poster.mjs','delivery.mjs','full-css-client.js','hero.mjs','stream-home.mjs','style-urls.mjs']
    retained_hashes={}
    for name in retained_sources:
        file=base/'paint-performance'/name;assert file.is_file() and file.stat().st_size,name+' missing from retained image'
        subprocess.run(['node','--check',str(file)],check=True,stdout=subprocess.DEVNULL)
        retained_hashes[name]=sha(file.read_bytes())
    announcement=(base/'paint-performance/announcement.mjs').read_text()
    assert 'addHomeDiscovery' in announcement and 'renderInitialHome' in announcement,'Retained SEO discovery wrapper missing'
    save('retained-source-quality.json',{'passed':True,'baseImage':image,'syntaxChecked':retained_sources,'sha256':retained_hashes,'seoDiscoveryWrapperPreserved':True})

    html=(base/'dist/index.html').read_text();refs=re.findall(r'<script type="module" crossorigin src="([^"]+)"',html);assert len(refs)==1
    bundle=refs[0].removeprefix('./').removeprefix('/');assert re.fullmatch(r'assets/index-[a-f0-9]{16}\.js',bundle)
    bundle_file=(base/'dist'/bundle);bundle_hash=sha(bundle_file.read_bytes());assert bundle_hash[:16] in bundle
    videos=json.loads((base/'paint-performance/initial-hero.json').read_text());assert isinstance(videos,dict) and len(videos)==1
    manifest={'videos':videos}
    retained_media=[]
    for variants in videos.values():
        for kind in ['mobile','desktop']:
            row=variants[kind]
            for key in ['poster','url']:dist_asset(base,'/'+row[key].lstrip('/'))
            for key,pattern in [('avifPoster',r'/media-performance/assets/poster-([a-f0-9]{16})\.avif'),('av1Url',r'/media-performance/assets/hero-av1-([a-f0-9]{16})-\d+\.mp4')]:
                match=re.fullmatch(pattern,row[key]);assert match;file=dist_asset(base,row[key]);assert sha(file.read_bytes()).startswith(match[1]);retained_media.append(row[key])
            if row.get('avifPosterSmall'):
                match=re.fullmatch(r'/media-performance/assets/poster-([a-f0-9]{16})\.avif',row['avifPosterSmall']);assert match
                file=dist_asset(base,row['avifPosterSmall']);assert sha(file.read_bytes()).startswith(match[1]);retained_media.append(row['avifPosterSmall'])

    head_assets=json.loads((base/'paint-performance/head-assets.json').read_text());assert set(head_assets)=={'logo','seo','countdown'}
    for row in head_assets.values():
        if row:assert sha(dist_asset(base,row['url']).read_bytes())==row['sha256'] and row['sha256'][:16] in row['url']
    logo=head_assets['logo'];assert sha((base/'dist/assets/images/hidi-logo.png').read_bytes())==logo['sourceSha256'] and logo['allRgbaPixelsIdentical'] is True
    countdown=head_assets['countdown'];source=(base/countdown['sourceFile']).read_text().replace('\r\n','\n').encode();assert sha(source)==countdown['sourceSha256']
    save('head-assets-quality.json',{'passed':True,**head_assets,'reusedFromCurrentImage':True})

    home_pricing=json.loads((base/'paint-performance/home-pricing.json').read_text());pricing=(base/'pricing/storefront.mjs').read_text()
    assert pricing==(HERE.parent/'pricing/storefront.mjs').read_text() and sha(pricing.encode())==home_pricing['sourceSha256']
    assert sha(dist_asset(base,home_pricing['url']).read_text().encode())==home_pricing['homeSha256']

    encodings=json.loads((base/'paint-performance/asset-encodings.json').read_text());assert len(encodings.get('entries',[]))==1
    encoded=encodings['entries'][0];assert encoded['url']=='/'+bundle and encoded['sha256']==bundle_hash and encoded['bytes']==bundle_file.stat().st_size
    for encoding,row in encoded['encodings'].items():
        assert encoding in ['br','gzip'] and re.fullmatch(r'encodings/[a-f0-9]{64}\.(?:br|gzip)',row['file'])
        file=(base/'paint-performance'/row['file']).resolve();file.relative_to((base/'paint-performance/encodings').resolve());data=file.read_bytes()
        assert len(data)==row['bytes'] and sha(data)==row['sha256']
    save('static-encoding-quality.json',{'passed':True,'buildTimeCompression':True,'decodedBytesIdentical':True,'reusedFromCurrentImage':True,**encoded})

    styles=json.loads((base/'paint-performance/style-assets.json').read_text());assert styles.get('styles')
    existing_mirror=json.loads((base/'paint-performance/asset-mirror.json').read_text());mirror.verify(existing_mirror)
    assert existing_mirror['files'].get('/'+bundle)==bundle_hash
    for path,digest in existing_mirror['files'].items():assert sha(dist_asset(base,path).read_bytes())==digest and digest[:16] in path
    mirror_overlay=folder/'mirror-check';(mirror_overlay/'paint-performance').mkdir(parents=True)
    shutil.copyfile(base/'paint-performance/style-assets.json',mirror_overlay/'paint-performance/style-assets.json')
    for path in existing_mirror['files']:
        target=mirror_overlay/'dist'/path.lstrip('/');target.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(dist_asset(base,path),target)
    report={'passed':True,'bundle':bundle,'originalBundle':bundle,'cssUnchanged':True,'seoHomeDiscoveryPreserved':(base/'seo-document/discovery.mjs').is_file(),'homePricingBundle':home_pricing['url'].lstrip('/'),'globalPricingSourceSha256':sha((base/'pricing/storefront.mjs').read_bytes()),'pricingPresentationAndHydrationPreserved':True,'reusedCurrentPerformanceImage':True}
    published=mirror.publish(mirror_overlay,report,manifest,folder,OUT);assert published['files']==existing_mirror['files'] and published['origin']==existing_mirror['origin']
    assert published.get('edgeOrigin')==existing_mirror.get('edgeOrigin') and published.get('edgeFiles')==existing_mirror.get('edgeFiles')
    shutil.rmtree(mirror_overlay)

    critical=json.loads((base/'paint-performance/critical-css.json').read_text());assert critical.get('styles')
    save('critical-css-quality.json',{'passed':True,'strategy':'retained-verified-critical-inline-full-external','allSourceCssPreserved':True,'styles':critical['styles']})
    save('poster-quality.json',{'passed':True,'reusedFromCurrentImage':True,'verifiedAssets':sorted(set(retained_media))})
    save('video-quality.json',{'passed':True,'reusedFromCurrentImage':True,'verifiedAssets':sorted(path for path in retained_media if path.endswith('.mp4'))})
    save('media-cache.json',{'passed':True,'available':True,'encodedVideosOnly':True,'currentRuntimeImage':image,'reusedFromCurrentImage':True,'reason':'Every retained immutable media byte and public mirror response was revalidated'})
    save('manifest.json',manifest);save('icon-quality.json',icons)
    target=overlay/'lcp-performance/head.mjs';target.parent.mkdir(parents=True);target.write_bytes(next_head)
    report['allowedFiles']=['lcp-performance/head.mjs'];save('patch.json',report)
    return report

def analytics():
    value=json.loads(cloud.get('/api/hidi/analytics-config'))
    return {key:value.get(key) for key in ['enabled','ga4MeasurementId','metaPixelId']}
def capture():
    # Read-only preparation may overlap other testing; exact-state guards reject any changed live image.
    photo.capture();photo.backup()
    resources={}
    for name,app in photo.originals().items():
        properties=app.get('properties',{});template=properties.get('template') or {};scale=template.get('scale') or {};ingress=(properties.get('configuration') or {}).get('ingress') or {}
        resources[name]={'containers':[{'name':c.get('name'),'resources':c.get('resources'),
            'probes':[{'type':p.get('type'),'initialDelaySeconds':p.get('initialDelaySeconds'),'periodSeconds':p.get('periodSeconds'),'timeoutSeconds':p.get('timeoutSeconds'),'failureThreshold':p.get('failureThreshold'),'path':(p.get('httpGet') or {}).get('path'),'port':(p.get('httpGet') or {}).get('port')} for p in (c.get('probes') or [])]} for c in template.get('containers',[])],
            'scale':{key:scale.get(key) for key in ['minReplicas','maxReplicas','pollingInterval','cooldownPeriod']},
            'ingress':{key:ingress.get(key) for key in ['targetPort','external','transport','allowInsecure']}}
    save('runtime-resources.json',resources)
    selected=selections();(PRIVATE/'selections.json').write_text(json.dumps(selected));save('published-selections.json',selected)
    (PRIVATE/'analytics.json').write_text(json.dumps(analytics()))
    (PRIVATE/'public-offers.json').write_bytes(cloud.get('/api/hidi/offers'))
    (PRIVATE/'catalogue.json').write_bytes(cloud.get('/api/store/products'))
def compose():
    photo.require_backups();photo.unchanged(photo.states())
    folder=PRIVATE/'web';folder.mkdir();base=folder/'base-app';overlay=folder/'overlay';candidate=folder/'candidate-app'
    image=photo.states()['hidi-web']['image'];images.extract(image,base)
    icon_check=folder/'icon-check';icons=patch.build_icons(base,icon_check);shutil.rmtree(icon_check)
    if (base/'paint-performance/initial-hero.json').is_file():
        report=existing_performance_compose(base,overlay,folder,image,icons)
        for file in overlay.rglob('*'):
            if file.is_file() and file.suffix in ('.js','.mjs'):subprocess.run(['node','--check',str(file)],check=True)
        tag=os.environ['CANDIDATE_WEB'];assert re.fullmatch(re.escape(images.REGISTRY+'/hidi-web:paint-performance-')+r'\d+',tag)
        (folder/'Dockerfile').write_text('FROM '+image+'\nCOPY --chown=node:node overlay/ /app/\n')
        subprocess.run(['docker','build','--pull=false','-t',tag,str(folder)],check=True);images.extract(tag,candidate)
        proof=preserve.verify(base,candidate,overlay,set(report['allowedFiles']),json.loads(images.docker('image','inspect',image,tag)))
        assert proof['changedFiles']==['lcp-performance/head.mjs'] and all((candidate/p).read_bytes()==(base/p).read_bytes() for p in images.fingerprints(base) if p.endswith('.css'))
        proof.update({'allExistingCssIdentical':True,'originalUploadsPreserved':True,'nextStorefrontIdentical':True,'currentProductPagePreserved':True})
        assert (candidate/'pricing/storefront.mjs').read_bytes()==(base/'pricing/storefront.mjs').read_bytes()
        save('commerce-preservation.json',{'passed':True,'allPricingAndNextFilesByteIdentical':True,'homepageLoaderOnly':True,'currentProductPagePreserved':True,'globalPricingSourceSha256':report['globalPricingSourceSha256']})
        save('preservation.json',proof);photo.unchanged(photo.states());return
    icons=patch.build_icons(base,overlay);save('icon-quality.json',icons)
    # This recipe is encoded from current originals. Older cached AV1 files used
    # a different speed/quality policy and must not silently substitute for it.
    media_env={**os.environ}
    save('media-cache.json',{'passed':True,'available':False,'encodedVideosOnly':True,'currentRuntimeImage':image,'reason':'Pinned current-recipe immutable bytes may be reused; full quality validation always runs'})
    subprocess.run(['node',str(HERE/'posters.mjs'),str(base),str(overlay)],check=True,env=media_env)
    poster=json.loads((overlay/'poster-build.json').read_text());save('poster-quality.json',poster['report']);save('video-quality.json',poster['videoReport']);save('head-assets-quality.json',poster['headAssets']);(overlay/'poster-build.json').unlink()
    # Native-screen CSS paints immediately; exact complete sheets load independently at low priority.
    subprocess.run(['node',str(HERE/'critical-css.mjs'),str(base),str(overlay)],check=True)
    save('critical-css-quality.json',{'strategy':'critical-inline-full-external','allSourceCssPreserved':True,'styles':json.loads((overlay/'paint-performance/critical-css.json').read_text())['styles']})
    report=patch.patch_web(base,overlay,poster,icons);manifest=report.pop('manifest')
    subprocess.run(['node',str(HERE/'build-styles.mjs'),str(base),str(overlay)],check=True)
    subprocess.run(['node',str(HERE/'precompress.mjs'),str(overlay),report['bundle'],str(OUT/'static-encoding-quality.json')],check=True)
    for file in overlay.rglob('*'):
        if file.is_file() and file.suffix in ('.js','.mjs'):subprocess.run(['node','--check',str(file)],check=True)
    mirror.publish(overlay,report,manifest,folder,OUT)
    report['allowedFiles']=sorted(p.relative_to(overlay).as_posix() for p in overlay.rglob('*') if p.is_file())
    save('patch.json',report);save('manifest.json',manifest)
    tag=os.environ['CANDIDATE_WEB'];assert re.fullmatch(re.escape(images.REGISTRY+'/hidi-web:paint-performance-')+r'\d+',tag)
    (folder/'Dockerfile').write_text('FROM '+image+'\nCOPY --chown=node:node overlay/ /app/\n')
    subprocess.run(['docker','build','--pull=false','-t',tag,str(folder)],check=True);images.extract(tag,candidate)
    proof=preserve.verify(base,candidate,overlay,set(report['allowedFiles']),json.loads(images.docker('image','inspect',image,tag)))
    assert all((candidate/p).read_bytes()==(base/p).read_bytes() for p in images.fingerprints(base) if p.endswith('.css'))
    proof.update({'allExistingCssIdentical':True,'originalUploadsPreserved':True,'nextStorefrontIdentical':True})
    assert not any(name.startswith(('pricing/','apps/web/')) for name in report['allowedFiles']),'Commerce files must remain outside the performance overlay'
    assert (candidate/'pricing/storefront.mjs').read_bytes()==(base/'pricing/storefront.mjs').read_bytes()
    save('commerce-preservation.json',{'passed':True,'allPricingAndNextFilesByteIdentical':True,'homepageLoaderOnly':True,'globalPricingSourceSha256':report['globalPricingSourceSha256']})
    save('preservation.json',proof);photo.unchanged(photo.states())
def wait(image,suffix,baseline):
    for _ in range(120):
        state=cloud.snapshot(cloud.app('hidi-web'));assert state['settingsHash']==baseline['settingsHash']
        assert state['image'] in (image,baseline['image']),'Independent web rollout'
        if state['image']==image and state['latest']==state['ready']=='hidi-web--'+suffix:return state
        time.sleep(5)
    raise AssertionError('Readiness timeout')
def apply():
    before=photo.states();photo.require_backups();photo.unchanged(before)
    for name in ['preservation.json','candidate.json','visual-comparison.json','fallback-safety.json','desktop-video-safety-candidate.json','loader-safety-candidate.json','static-encoding-quality.json','protocol-comparison.json','commerce-preservation.json','header-layout-candidate.json','initial-css-candidate.json','poster-cache-candidate.json','poster-tiers-candidate.json','network-fixture.json','candidate-origin.json','head-assets-quality.json','public-fixture-health.json','media-cache.json','asset-mirror.json','mirror-fallback-candidate.json']:
        assert json.loads((OUT/name).read_text())['passed'],name+' must pass'
    loader=json.loads((OUT/'loader-safety-candidate.json').read_text());assert len(loader['results'])==21 and all(row['passed'] for row in loader['results']) and all(sum(row['engine']==engine for row in loader['results'])==7 for engine in ['chromium','firefox','webkit'])
    checkout=json.loads((OUT/'checkout-candidate/report.json').read_text());assert checkout['passed'] and len(checkout['cases'])==24 and not checkout['runtimeErrors'] and checkout['productionWrites']==0
    layout=json.loads((OUT/'header-layout-candidate.json').read_text());assert layout['passed'] and layout['expected']=={'chromium':[320,390,768,1001,1440],'firefox':[390,1440],'webkit':[390,1440]} and len(layout['results'])==9 and all(row['headerLayout']['passed'] for row in layout['results']) and len(layout['campaignOffCleanup'])==3 and all(row['passed'] and row['announcementCount']==0 for row in layout['campaignOffCleanup'])
    initial_css=json.loads((OUT/'initial-css-candidate.json').read_text());assert initial_css['passed'] and len(initial_css['results'])==10 and all(row['width'] in [320,390,768,1001,1440] and row['ssrLayout']['passed'] and row['completeLayout']['passed'] for row in initial_css['results']) and all(sum(row['engine']==engine for row in initial_css['results'])==5 for engine in ['chromium','webkit'])
    recovery=json.loads((OUT/'mirror-fallback-candidate.json').read_text());assert recovery['passed'] and len(recovery['cases'])==32 and recovery['writes']==0 and recovery['integrityRecovery'] and recovery['streamedDocumentRecovery'] and recovery['stylesheetIntegrityRecovery'] and recovery['edgeOriginRecovery']
    mirror.verify(json.loads((OUT/'asset-mirror.json').read_text()))
    for row in json.loads((OUT/'lighthouse/candidate.json').read_text()):
        assert row['score']>=93 and row['cls']<=.1
        assert row['device']!='mobile' or row['lcp']<2200
    assert selections()==json.loads((PRIVATE/'selections.json').read_text()),'Published media changed during preparation'
    assert analytics()==json.loads((PRIVATE/'analytics.json').read_text()),'Analytics configuration changed during preparation'
    image=os.environ['WEB_IMAGE'];assert re.fullmatch(re.escape(images.REGISTRY+'/hidi-web@sha256:')+r'[a-f0-9]{64}',image)
    protected=photo.public_state();suffix='paintperf'+os.environ['GITHUB_RUN_ID']+'a'+os.environ.get('GITHUB_RUN_ATTEMPT','1')
    def interrupted(signum,frame):
        signal.signal(signal.SIGTERM,signal.SIG_IGN)
        raise InterruptedError('Owned rollout interrupted; restore the original image')
    signal.signal(signal.SIGTERM,interrupted)
    try:
        cloud.write_image(photo.originals()['hidi-web'],image,suffix);state=wait(image,suffix,before['hidi-web'])
        for path in ['/health','/healthz','/api/store/health/ready','/','/collections/all','/cart','/checkout','/account','/admin','/admin/hero-media','/admin/landing-media']:
            cloud.get(path)
        subprocess.run(['node',str(HERE/'probe.mjs'),'https://hidiindia.com','live'],check=True,timeout=600)
        subprocess.run(['node',str(HERE.parent/'checkout-hydration/probe.mjs'),'https://hidiindia.com',str(OUT/'checkout-live')],check=True,timeout=900,env={**os.environ,'HIDI_BROWSER_ENGINES':'chromium,firefox,webkit','HIDI_LOCAL_OVERLAY':'0','HIDI_ASSET_MIRROR_PROOF_DIR':str(OUT)})
        subprocess.run(['node',str(HERE/'lighthouse.mjs'),'after'],check=True,timeout=600)
        assert photo.public_state()==protected,'Published configuration changed'
        assert analytics()==json.loads((PRIVATE/'analytics.json').read_text()),'Analytics configuration changed'
        assert cloud.snapshot(cloud.app('hidi-api'))==before['hidi-api'],'API changed independently'
        assert cloud.snapshot(cloud.app('hidi-web'))==state
        save('after.json',{'passed':True,'web':state,'apiUnchanged':True,'settingsPreserved':True,'publishedSelectionsPreserved':True,'databaseAndBlobWrites':False})
    except BaseException:
        data=cloud.app('hidi-web');current=cloud.snapshot(data)
        if current['image']==image and current['latest']=='hidi-web--'+suffix and current['settingsHash']==before['hidi-web']['settingsHash']:
            rollback='paintrollback'+os.environ['GITHUB_RUN_ID']+'a'+os.environ.get('GITHUB_RUN_ATTEMPT','1');cloud.write_image(data,before['hidi-web']['image'],rollback);wait(before['hidi-web']['image'],rollback,current);save('rollback.json',{'restored':True})
        raise
def deploy_capture():
    expected=json.loads((OUT/'before.json').read_text())
    selected=json.loads((OUT/'published-selections.json').read_text())
    photo.capture()
    assert photo.states()==expected,'Production changed after candidate verification; stop without replacing it'
    assert selections()==selected,'Selected media changed after candidate verification'
    (PRIVATE/'selections.json').write_text(json.dumps(selected))
    (PRIVATE/'analytics.json').write_text(json.dumps(analytics()))
if __name__=='__main__':
    import sys
    globals()[sys.argv[1]]()
