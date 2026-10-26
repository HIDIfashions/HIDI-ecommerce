"""Read-only private SQL and exact-runtime inspection. No provider sends or app writes."""
import base64, gzip, importlib.util, json, os, pty, re, select, shlex, subprocess, time
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
def load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module)
    return module
cloud = load('cloud', ROOT/'privacy-policy/rollout.py')
terminal = load('terminal', ROOT/'admin-delete/schema-readiness.py')
def app(name):
    assert name in {'hidi-api','hidi-web'}
    return cloud.azure('rest','--method','get','--url','https://management.azure.com/subscriptions/91d9572d-0f0b-47fe-802d-0eef36d7c719/resourceGroups/rg-hidi-prod/providers/Microsoft.App/containerApps/'+name+'?api-version=2025-07-01')
cloud.app = app
def probe(data):
    env={v['name']:v.get('value') for v in data['properties']['template']['containers'][0].get('env',[])}
    database=env.get('AZURE_SQL_DATABASE'); assert database
    packed=base64.b64encode(gzip.compress((ROOT/'whatsapp-msg91/readiness.mjs').read_bytes(),mtime=0)).decode()
    lines=['node --input-type=commonjs - '+shlex.quote(database)+" <<'HIDI_WHATSAPP_PROBE'",'const packed=[']
    lines += [json.dumps(packed[i:i+1800])+',' for i in range(0,len(packed),1800)]
    lines += ["].join('');",'const bytes=require("node:zlib").gunzipSync(Buffer.from(packed,"base64"));', 'import("data:text/javascript;base64,"+bytes.toString("base64")).then(m=>m.run(process.argv[2])).catch(e=>{console.log("HIDI_MSG91_PROBE_FAILED::"+JSON.stringify({name:e.name,code:e.code}));process.exitCode=1;});','HIDI_WHATSAPP_PROBE','exit']
    command='\n'.join(lines)+'\n'; assert all(len(x.encode())<2000 for x in lines)
    master,slave=pty.openpty()
    process=subprocess.Popen(['az','containerapp','exec','-g','rg-hidi-prod','-n','hidi-api','--revision',data['properties']['latestReadyRevisionName'],'--container',data['properties']['template']['containers'][0]['name'],'--command','/bin/sh','--only-show-errors'],stdin=slave,stdout=slave,stderr=slave,start_new_session=True)
    os.close(slave); os.set_blocking(master,False)
    output=b''; pending=b''; sent=False; report=None
    try:
        deadline=time.monotonic()+180
        while time.monotonic()<deadline:
            readable,writable,_=select.select([master],[master] if pending else [],[],1)
            if writable:
                try: pending=pending[os.write(master,pending[:2048]):]
                except BlockingIOError: pass
            if readable:
                try: chunk=os.read(master,65536)
                except BlockingIOError: continue
                except OSError: break
                if not chunk: break
                output+=chunk; plain=terminal.terminal_text(output.decode(errors='replace'))
                if not sent and re.search(r'(?:^|[\r\n])[^\r\n]{0,160}[#$] $',plain): pending=command.encode();sent=True
                report=terminal.complete_marker(plain,'HIDI_MSG91_ORDERING_READINESS')
                failure=terminal.complete_marker(plain,'HIDI_MSG91_PROBE_FAILED')
                if failure: print(json.dumps(failure));break
                if report is not None: break
            if process.poll() is not None: break
        assert report is not None and report.get('readOnly') is True,'Private read-only probe incomplete'
        return report
    finally:
        os.close(master)
        if process.poll() is None:
            process.terminate()
            try:process.wait(timeout=10)
            except subprocess.TimeoutExpired:process.kill();process.wait(timeout=10)
def main():
    private=Path(os.environ['RUNNER_TEMP'])/'whatsapp-preflight';private.mkdir(exist_ok=True);private.chmod(0o700)
    evidence=Path('evidence/whatsapp-msg91');evidence.mkdir(parents=True,exist_ok=True)
    states={name:app(name) for name in ['hidi-api','hidi-web']}
    for value in states.values():cloud.ready(cloud.snapshot(value))
    report=probe(states['hidi-api'])
    report['states']={name:cloud.snapshot(value) for name,value in states.items()}
    report['scale']={name:value['properties']['template'].get('scale') for name,value in states.items()}
    (evidence/'readiness.json').write_text(json.dumps(report,indent=2));print(json.dumps(report))
    subprocess.run(['az','acr','login','--name','acrhidiprod0927','--only-show-errors'],check=True,stdout=subprocess.DEVNULL)
    for name in ['hidi-api','hidi-web']:
        image=report['states'][name]['image']
        subprocess.run(['docker','pull',image],check=True,stdout=subprocess.DEVNULL)
        cid=subprocess.check_output(['docker','create',image],text=True).strip()
        try:
            paths=['apps/api/dist/whatsapp','apps/api/dist/app.module.js'] if name=='hidi-api' else ['server.mjs']
            for rel in paths:
                target=private/(name+'-'+Path(rel).name)
                subprocess.run(['docker','cp',cid+':/app/'+rel,str(target)],check=True)
                if rel=='server.mjs':
                    lines=target.read_text().splitlines(); indexes=set()
                    for i,line in enumerate(lines):
                        if any(k in line for k in ['x-razorpay-signature','/api/store/','function proxy','waCart']):indexes.update(range(max(0,i-8),min(len(lines),i+14)))
                    snippets='\n'.join(str(i+1)+': '+lines[i] for i in sorted(indexes))
                    snippets=re.sub(r'[A-Za-z0-9_-]{70,}','[long-literal-redacted]',snippets)
                    (evidence/'proxy-snippets.txt').write_text(snippets);print('PROXY_ROUTING_SNIPPETS::'+snippets)
                elif target.is_dir():print('EXISTING_WHATSAPP_FILES::'+json.dumps(sorted(p.name for p in target.iterdir())))
                else:print('WHATSAPP_REGISTERED::'+str('WhatsAppModule' in target.read_text()))
        finally:subprocess.run(['docker','rm',cid],check=True,stdout=subprocess.DEVNULL)
    for name,value in states.items():assert cloud.snapshot(app(name))==cloud.snapshot(value),'Live state changed during inspection'
if __name__=='__main__':
    try:main()
    except Exception as error:
        print(str(error) if isinstance(error,(AssertionError,cloud.AzureOperationError)) else 'Read-only preflight failed; no live changes')
        raise SystemExit(1)
