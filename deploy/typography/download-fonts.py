"""Vendor approved, pinned Fontsource releases. Never replace an existing font silently."""
import argparse, base64, hashlib, io, json, pathlib, tarfile, urllib.request

folder=pathlib.Path(__file__).resolve().parent/'fonts'
approved=['poppins','montserrat','dm-sans','nunito-sans','source-sans-3','playfair-display','cormorant-garamond','libre-baskerville']
approved+=['bodoni-moda','dm-serif-display','prata','italiana','fraunces','merriweather','outfit','raleway','work-sans','plus-jakarta-sans','urbanist','lato']
static_weights={'poppins':list(range(100,1000,100)),'dm-serif-display':[400],'prata':[400],'italiana':[400],'lato':[100,300,400,700,900]}
parser=argparse.ArgumentParser();parser.add_argument('--cache-dir',type=pathlib.Path);args=parser.parse_args()
manifest=json.loads((folder/'manifest.json').read_text())
def retain(path,content):
    if path.exists():assert path.read_bytes()==content, 'Existing asset differs; review explicitly: '+str(path)
    else:path.write_bytes(content)
for name in approved:
    version='5.3.1' if name=='source-sans-3' else '5.3.0'
    package=('@fontsource/' if name in static_weights else '@fontsource-variable/')+name
    metadata=json.load(urllib.request.urlopen('https://registry.npmjs.org/'+package+'/'+version,timeout=30))
    assert metadata['license']=='OFL-1.1'
    cached=args.cache_dir/(name+'.tgz') if args.cache_dir else None
    archive=cached.read_bytes() if cached and cached.exists() else urllib.request.urlopen(metadata['dist']['tarball'],timeout=30).read()
    integrity='sha512-'+base64.b64encode(hashlib.sha512(archive).digest()).decode()
    assert integrity==metadata['dist']['integrity']
    files=[]
    with tarfile.open(fileobj=io.BytesIO(archive),mode='r:gz') as tar:
        axes='standard' if name in ['bodoni-moda','fraunces','merriweather'] else 'wght'
        sources=[(f'package/files/{name}-latin-{w}-normal.woff2',f'{name}-{w}.woff2') for w in static_weights[name]] if name in static_weights else [(f'package/files/{name}-latin-{axes}-normal.woff2',name+'.woff2')]
        for source,target in sources:
            data=tar.extractfile(source).read();assert data[:4]==b'wOF2';retain(folder/target,data)
            files.append({'file':target,'source':source,'sha256':hashlib.sha256(data).hexdigest(),'bytes':len(data)})
        license_name=next(n for n in tar.getnames() if n.lower() in ['package/license','package/ofl.txt','package/license.txt'])
        license_data=tar.extractfile(license_name).read();assert b'SIL OPEN FONT LICENSE' in license_data
        retain(folder/(name+'-LICENSE.txt'),license_data)
    entry={'name':name,'package':package,'version':version,'tarball':metadata['dist']['tarball'],'integrity':integrity,'license':'OFL-1.1','licenseSha256':hashlib.sha256(license_data).hexdigest(),'files':files}
    previous=next((item for item in manifest if item['name']==name),None)
    if previous:assert previous==entry
    else:manifest.append(entry)
(folder/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
print(json.dumps({'approvedFamilies':len(approved),'familiesBundled':len(manifest),'newFontBytes':sum(f['bytes'] for item in manifest for f in item.get('files',[]))}))
