"""Collapse only layer history; preserve the merged filesystem and runtime config."""
import hashlib, io, json, subprocess, tarfile
from pathlib import Path

def run(*args):
    return subprocess.check_output(args, text=True)

def flatten(image, tag, folder, authfile):
    folder=Path(folder);folder.mkdir()
    oci=folder/'oci';bundle=folder/'bundle';layer=folder/'layer.tar'
    run('skopeo','copy','--authfile',str(authfile),'docker://'+image,'oci:'+str(oci)+':baseline')
    index=json.loads((oci/'index.json').read_text())
    def blob(digest):
        kind,value=digest.split(':');assert kind=='sha256'
        data=(oci/'blobs'/kind/value).read_bytes();assert hashlib.sha256(data).hexdigest()==value
        return json.loads(data)
    manifest=blob(index['manifests'][0]['digest']);config=blob(manifest['config']['digest'])
    # Privileged unpack preserves original ownership and capabilities. Never execute the image.
    run('sudo','umoci','unpack','--image',str(oci)+':baseline',str(bundle))
    run('sudo','tar','--xattrs','--acls','--numeric-owner','-C',str(bundle/'rootfs'),'-cpf',str(layer),'.')
    with layer.open('rb') as stream: diff=hashlib.file_digest(stream,'sha256').hexdigest()
    updated={**config,'rootfs':{'type':'layers','diff_ids':['sha256:'+diff]},'history':[{'created_by':'Exact merged filesystem; layer history collapsed'}]}
    assert {k:v for k,v in updated.items() if k not in ['rootfs','history']}=={k:v for k,v in config.items() if k not in ['rootfs','history']}
    payload=json.dumps(updated,separators=(',',':')).encode();name=hashlib.sha256(payload).hexdigest()+'.json'
    archive=folder/'baseline.tar'
    with tarfile.open(archive,'w') as out:
        for path,data in [(name,payload),('manifest.json',json.dumps([{'Config':name,'RepoTags':[tag],'Layers':['layer.tar']}]).encode())]:
            entry=tarfile.TarInfo(path);entry.size=len(data);out.addfile(entry,io.BytesIO(data))
        out.add(layer,arcname='layer.tar')
    run('docker','load','--input',str(archive))
    inspected=json.loads(run('docker','image','inspect',tag))[0]
    assert inspected['Config']==config['config'],'Flattening changed runtime configuration'
    assert inspected['RootFS']['Layers']==['sha256:'+diff]
    # Docker's content-addressed layer confirms it loaded the exact tar we generated.
    return {'passed':True,'sourceImage':image,'baselineTag':tag,'originalLayers':len(manifest['layers']),'flattenedLayers':1,'runtimeConfigUnchanged':True,'mergedLayerSha256':diff}
