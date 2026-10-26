"""Apply the exact previously tested images after normalizing ARM state reads."""
import importlib.util,json,pathlib,shutil,subprocess
ROOT=pathlib.Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location('wa_retry',ROOT/'release.py');release=importlib.util.module_from_spec(spec);spec.loader.exec_module(release)
TARGETS={'api':'acrhidiprod0927.azurecr.io/hidi-api@sha256:580992d770b060692e6e58f64720ccdec715eb0f74e5ef47bf22e7227d5c46ff','web':'acrhidiprod0927.azurecr.io/hidi-web@sha256:3d22821d368b82934a124173549f1fa058e246510bd47915f3da9dee15080d2d'}
def main():
    previous=pathlib.Path('previous-whatsapp-release')
    tests=json.loads((previous/'tests.json').read_text())
    assert tests=={'passed':True,'actualCandidateSqlServer':True,'actualRuntimeCallbackProxy':True,'noLiveSends':True}
    original={name:release.cloud.app(name) for name in release.EXPECTED}
    for name,data in original.items():
        state=release.cloud.snapshot(data);release.cloud.ready(state)
        assert state['image']==release.EXPECTED[name],'Production image changed; cannot reuse candidate'
        # Capture and compare the same raw ARM representation used by the write.
        url='https://management.azure.com'+data['id']+'?api-version=2025-07-01'
        raw,*_=release.helper.guard.arm_request('GET',url,release.helper.guard.arm_token())
        assert release.cloud.snapshot(raw)==state,'Raw ARM state must match before any mutation'
    (release.PRIVATE/'originals.json').write_text(json.dumps(original));(release.PRIVATE/'originals.json').chmod(0o600)
    release.save('before.json',{name:release.cloud.snapshot(data) for name,data in original.items()})
    for kind,digest in TARGETS.items():
        report=json.loads((previous/(kind+'-preservation.json')).read_text())
        assert report['passed'] and report['runtimeConfigurationPreserved'] and report['baseLayersPreserved']
        assert report['baseImage']==release.EXPECTED['hidi-'+kind]
        assert report['candidateTag']==release.images.REGISTRY+'/hidi-'+kind+':whatsapp-40260169477a1'
        subprocess.run(['docker','pull',digest],check=True)
        assert json.loads(release.images.docker('image','inspect',digest))[0]['Id']==report['imageId'],'Tested image identity mismatch'
        subprocess.run(['docker','tag',digest,report['candidateTag']],check=True)
        release.save(kind+'-preservation.json',report)
    release.save('tests.json',tests)
    release.save('reused-evidence.json',{'run':40260169477,'job':121370624532,'candidatesUnchanged':True,'digests':TARGETS})
    release.apply()
if __name__=='__main__':
    try:main()
    except Exception as error:
        print(str(error) if isinstance(error,(AssertionError,release.cloud.AzureOperationError)) else 'Verified-image release failed; inspect sanitized evidence')
        raise SystemExit(1)
