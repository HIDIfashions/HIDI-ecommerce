"""Vendor redistributable WOFF2 files and their licenses; retain exact versions and hashes."""
import hashlib, io, json, pathlib, tarfile, urllib.request
folder=pathlib.Path(__file__).resolve().parent/'fonts'
manifest=[]
for name in ['inter','lora','manrope']:
    metadata=json.load(urllib.request.urlopen('https://registry.npmjs.org/@fontsource-variable/'+name+'/latest'))
    archive=urllib.request.urlopen(metadata['dist']['tarball']).read()
    with tarfile.open(fileobj=io.BytesIO(archive),mode='r:gz') as package:
        font=package.extractfile('package/files/'+name+'-latin-wght-normal.woff2').read()
        license_name=next(n for n in package.getnames() if n.lower() in ['package/license','package/ofl.txt','package/license.txt'])
        license_data=package.extractfile(license_name).read()
    assert font[:4]==b'wOF2'
    folder.joinpath(name+'.woff2').write_bytes(font)
    folder.joinpath(name+'-LICENSE.txt').write_bytes(license_data)
    manifest.append({'name':name,'package':metadata['name'],'version':metadata['version'],'tarball':metadata['dist']['tarball'],'sha256':hashlib.sha256(font).hexdigest(),'bytes':len(font)})
folder.joinpath('manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
print(json.dumps(manifest))
