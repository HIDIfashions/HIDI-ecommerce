"""Execute a bounded, sanitized probe in an existing API revision; never print console output."""
import base64, json, os, pathlib, pty, re, select, shlex, subprocess, time

def run(data, source, arguments=(), timeout=180):
    encoded = base64.b64encode(source.encode()).decode()
    expression = 'eval(Buffer.from(' + json.dumps(encoded) + ',"base64").toString())'
    command = 'node -e ' + shlex.quote(expression) + ''.join(' '+shlex.quote(str(a)) for a in arguments) + '; exit\n'
    master, slave = pty.openpty()
    process = subprocess.Popen(['az','containerapp','exec','-g','rg-hidi-prod','-n','hidi-api',
      '--revision',data['properties']['latestReadyRevisionName'],'--container',data['properties']['template']['containers'][0]['name'],
      '--command','/bin/sh','--only-show-errors'],stdin=slave,stdout=slave,stderr=slave,start_new_session=True)
    os.close(slave); output=b''; sent=False
    try:
        deadline=time.monotonic()+timeout
        while time.monotonic()<deadline:
            if select.select([master],[],[],1)[0]:
                try: chunk=os.read(master,65536)
                except OSError: break
                if not chunk: break
                output+=chunk
                plain=re.sub(r'\x1b\[[0-?]*[ -/]*[@-~]','',output.decode(errors='replace'))
                if not sent and re.search(r'(?:^|[\r\n])[^\r\n]{0,160}[#$] $',plain):
                    os.write(master,command.encode());sent=True
                match=re.search(r'HIDI_DELIVERY_RESULT::(\{[^\r\n]+\})',plain)
                if match:
                    report=json.loads(match[1]);assert report.get('passed') is True, 'Private API probe failed: '+str(report.get('code','UNKNOWN'))
                    return report
            if process.poll() is not None: break
        raise RuntimeError('Private API probe did not complete; command sent='+str(sent))
    finally:
        os.close(master)
        if process.poll() is None:
            process.terminate()
            try: process.wait(timeout=10)
            except subprocess.TimeoutExpired: process.kill();process.wait(timeout=10)
