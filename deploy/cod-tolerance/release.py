"""One-file API update; retain all settings, web runtime and six-hour reservations."""
import importlib.util,json,os,pathlib,subprocess,sys
ROOT=pathlib.Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location('tolerance_helpers',ROOT.parent/'delivery-sync/release.py');helper=importlib.util.module_from_spec(spec);spec.loader.exec_module(helper)
cloud,images=helper.cloud,helper.images
PRIVATE=pathlib.Path(os.environ['RUNNER_TEMP'])/'cod-tolerance';PRIVATE.mkdir(exist_ok=True,mode=0o700)
EVIDENCE=pathlib.Path('evidence/cod-tolerance');EVIDENCE.mkdir(parents=True,exist_ok=True)
helper.PRIVATE=PRIVATE
RUN=helper.RUN
def save(name,value): (EVIDENCE/name).write_text(json.dumps(value,indent=2))
def read(name):return json.loads((EVIDENCE/name).read_text())
def old():return json.loads((PRIVATE/'originals.json').read_text())
def prepare():
    original={name:cloud.app(name) for name in ['hidi-api','hidi-web']}
    for data in original.values():cloud.ready(cloud.snapshot(data))
    (PRIVATE/'originals.json').write_text(json.dumps(original));(PRIVATE/'originals.json').chmod(0o600)
    image=cloud.snapshot(original['hidi-api'])['image'];images.validate_image(image,'api');subprocess.run(['docker','pull',image],check=True)
    subprocess.run(['docker','buildx','imagetools','create','--tag',images.REGISTRY+'/hidi-api:cod-tolerance-backup-'+RUN,image],check=True)
    base=PRIVATE/'base';overlay=PRIVATE/'overlay';candidate=PRIVATE/'candidate';images.extract(image,base)
    patch=subprocess.run(['node',str(ROOT/'patch.mjs'),str(base),str(overlay)],capture_output=True,text=True)
    if patch.returncode:print(patch.stderr);patch.check_returncode()
    plan=json.loads(patch.stdout);save('patch.json',plan)
    tag=images.REGISTRY+'/hidi-api:cod-tolerance-'+RUN
    (PRIVATE/'.dockerignore').write_text('*\n!Dockerfile\n!overlay/\n!overlay/**\n')
    (PRIVATE/'Dockerfile').write_text('FROM '+image+'\nCOPY --chown=node:node overlay/ /app/\n')
    subprocess.run(['docker','build','--pull=false','-t',tag,str(PRIVATE)],check=True);images.extract(tag,candidate)
    report=helper.preserve.verify(base,candidate,overlay,set(plan['allowedFiles']),json.loads(images.docker('image','inspect',image,tag)))
    report.update({'baseImage':image,'candidateTag':tag,'imageId':json.loads(images.docker('image','inspect',tag))[0]['Id']});save('preservation.json',report)
    subprocess.run(['docker','run','--rm','--network','host','--entrypoint','node','-e','TRACKING_TEST_SQL_HOST=127.0.0.1','-e','TRACKING_TEST_SQL_PASSWORD='+os.environ['TRACKING_TEST_SQL_PASSWORD'],
      '-v',str(pathlib.Path('tests').resolve())+':/app/tests:ro','-v',str(pathlib.Path('apps/api/prisma').resolve())+':/app/apps/api/prisma:ro',tag,'/app/tests/delhivery-sync.sqlserver.mjs'],check=True,timeout=180)
    helper.unchanged(original);save('tests.json',{'passed':True,'actualCandidateSqlServer':True,'toleranceBoundaryPaise':100,'rejectBoundaryPaise':101})
def apply():
    assert read('tests.json')['passed'];report=read('preservation.json');original=old();helper.unchanged(original)
    tag=report['candidateTag'];subprocess.run(['docker','push',tag],check=True)
    inspected=json.loads(images.docker('image','inspect',tag))[0];assert inspected['Id']==report['imageId']
    image=next(v for v in inspected['RepoDigests'] if v.startswith(images.REGISTRY+'/hidi-api@'))
    subprocess.run(['docker','pull',image],check=True);assert json.loads(images.docker('image','inspect',image))[0]['Id']==report['imageId']
    helper.guard.install_interrupt_handler()
    try:
      current=helper.write(original['hidi-api'],image,'codtolerance'+RUN)
      assert cloud.snapshot(current)['settingsHash']==cloud.snapshot(original['hidi-api'])['settingsHash']
      helper.unchanged({'hidi-api':current,'hidi-web':original['hidi-web']});cloud.get('/api/store/health/ready')
      proof=helper.console.run(current,(ROOT/'confirm-target.mjs').read_text(),timeout=180);assert proof['targetConfirmed'];save('verified.json',proof)
      helper.unchanged({'hidi-api':current,'hidi-web':original['hidi-web']})
      save('after.json',{'passed':True,'api':cloud.snapshot(current),'webUnchanged':True,'settingsUnchanged':True})
      print('PASS: INR 1 COD tolerance deployed and requested order collection confirmed; six-hour schedule retained')
    except BaseException:
      marker=PRIVATE/'hidi-api-attempt.json'
      if marker.exists():
        attempted=json.loads(marker.read_text());current=cloud.app('hidi-api');state=cloud.snapshot(current)
        if state['image']==attempted['image'] and state['latest']=='hidi-api--'+attempted['suffix'] and state['settingsHash']==attempted['settingsHash']:
          helper.write(current,cloud.snapshot(original['hidi-api'])['image'],'codtolerancerollback'+RUN)
          print('Owned API runtime restored; any verified collection audit retained')
      raise
if __name__=='__main__':
  try: {'prepare':prepare,'apply':apply}[sys.argv[1]]()
  except Exception as error:
    print(str(error) if isinstance(error,(AssertionError,cloud.AzureOperationError)) else 'COD tolerance release stopped; inspect sanitized evidence',file=sys.stderr);sys.exit(1)
