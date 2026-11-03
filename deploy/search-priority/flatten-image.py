"""Collapse only layer history; preserve the merged filesystem and runtime config."""
import hashlib, io, json, subprocess, tarfile
from pathlib import Path

def run(*args):
    return subprocess.check_output(args, text=True)

def flatten(image, tag, folder, authfile):
    folder=Path(folder);folder.mkdir()
    oci=folder/'oci';bundle=folder/'bundle';layer=folder/'layer.tar'
    original=json.loads(run('skopeo','inspect','--config','--authfile',str(authfile),'docker://'+image))
    run('skopeo','copy','--authfile',str(authfile),'docker://'+image,'oci:'+str(oci)+':baseline')
    index=json.loads((oci/'index.json').read_text())
    def blob(digest):
        kind,value=digest.split(':');assert kind=='sha256'
        data=(oci/'blobs'/kind/value).read_bytes();assert hashlib.sha256(data).hexdigest()==value
        return json.loads(data)
    manifest=blob(index['manifests'][0]['digest']);oci_config=blob(manifest['config']['digest'])
    assert original['rootfs']==oci_config['rootfs'],'Source layers changed during OCI transport'
    config=original # Preserve Docker-only settings too, including health checks.
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
    # Docker inspect materializes absent default fields in a loaded config.
    defaults={'Hostname':'','Domainname':'','AttachStdin':False,'AttachStdout':False,'AttachStderr':False,'Tty':False,'OpenStdin':False,'StdinOnce':False,'OnBuild':None,'Volumes':None,'Labels':None,'StopSignal':'','Shell':None,'ArgsEscaped':False}
    def normalized(value):return {k:v for k,v in value.items() if k not in defaults or v!=defaults[k]}
    expected,actual=normalized(config['config']),normalized(inspected['Config'])
    differences=[k for k in expected.keys()|actual.keys() if expected.get(k)!=actual.get(k)]
    assert expected==actual,'Flattening changed runtime configuration fields: '+str(differences)
    assert inspected['RootFS']['Layers']==['sha256:'+diff]
    # Docker's content-addressed layer confirms it loaded the exact tar we generated.
    return {'passed':True,'sourceImage':image,'baselineTag':tag,'originalLayers':len(manifest['layers']),'flattenedLayers':1,'runtimeConfigUnchanged':True,'mergedLayerSha256':diff}
