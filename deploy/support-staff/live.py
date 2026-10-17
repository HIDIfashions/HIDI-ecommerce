"""Execute narrowly scoped Owner provisioning or rollback-only support checks inside the ready API."""
import base64,gzip,importlib.util,json,os,pty,re,select,subprocess,sys,time
from pathlib import Path
def load(name,path):
 spec=importlib.util.spec_from_file_location(name,path);module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module);return module
cloud=load('support_live_cloud',Path('deploy/privacy-policy/rollout.py'))
terminal=load('support_live_terminal',Path('deploy/admin-delete/schema-readiness.py'))
mode=sys.argv[1];assert mode in ['inspect','owner','verify']
data=cloud.app('hidi-api');cloud.ready(cloud.snapshot(data))
packed=base64.b64encode(gzip.compress(Path('deploy/support-staff/live.mjs').read_bytes(),mtime=0)).decode()
lines=["node --input-type=commonjs <<'HIDI_SUPPORT_NODE'",'const packed=[']+[json.dumps(packed[i:i+1800])+',' for i in range(0,len(packed),1800)]+[
"].join('');",'const bytes=require("node:zlib").gunzipSync(Buffer.from(packed,"base64"));',
'import("data:text/javascript;base64,"+bytes.toString("base64")).then(m=>m.run('+json.dumps(mode)+')).catch(e=>{console.log("HIDI_SUPPORT_FAILED::"+JSON.stringify({error:e.message}));process.exitCode=1;});','HIDI_SUPPORT_NODE','exit']
master,slave=pty.openpty();process=subprocess.Popen(['az','containerapp','exec','-g','rg-hidi-prod','-n','hidi-api','--revision',data['properties']['latestReadyRevisionName'],'--container',data['properties']['template']['containers'][0]['name'],'--command','/bin/sh','--only-show-errors'],stdin=slave,stdout=slave,stderr=slave,start_new_session=True)
os.close(slave);os.set_blocking(master,False);output=b'';pending=b'';sent=False;report=None
try:
 deadline=time.monotonic()+240
 while time.monotonic()<deadline:
  readable,writable,_=select.select([master],[master] if pending else [],[],1)
  if writable:
   try:pending=pending[os.write(master,pending[:2048]):]
   except BlockingIOError:pass
  if readable:
   try:chunk=os.read(master,65536)
   except BlockingIOError:continue
   except OSError:break
   if not chunk:break
   output+=chunk;plain=terminal.terminal_text(output.decode(errors='replace'))
   if not sent and re.search(r'(?:^|[\r\n])[^\r\n]{0,160}[#$] $',plain):pending=('\n'.join(lines)+'\n').encode();sent=True
   report=terminal.complete_marker(plain,'HIDI_SUPPORT_LIVE')
   failed=terminal.complete_marker(plain,'HIDI_SUPPORT_FAILED')
   if failed:raise RuntimeError('Live support check failed: '+str(failed.get('error','unknown'))[:300])
   if report is not None:break
  if process.poll() is not None:break
 assert report and report.get('passed'),'Live check did not return a complete report'
 target=Path('evidence/support-staff');target.mkdir(parents=True,exist_ok=True);(target/(mode+'.json')).write_text(json.dumps(report,indent=2));print(json.dumps(report))
finally:
 os.close(master)
 if process.poll() is None:
  process.terminate()
  try:process.wait(timeout=10)
  except subprocess.TimeoutExpired:process.kill();process.wait(timeout=10)
