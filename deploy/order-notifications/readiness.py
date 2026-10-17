"""Inspect live order messaging readiness without changing live state."""
import base64
import gzip
import importlib.util
import json
import os
from pathlib import Path
import pty
import re
import select
import shlex
import subprocess
import time

ROOT = Path(__file__).resolve().parents[1]
def load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module)
    return module
cloud = load('owner_cloud', ROOT / 'privacy-policy/rollout.py')
terminal = load('owner_terminal', ROOT / 'admin-delete/schema-readiness.py')
# Use the stable ARM read endpoint for state capture; no extension serializer.
def app_state(name):
    assert name in {'hidi-api', 'hidi-web'}
    return cloud.azure('rest', '--method', 'get', '--url', 'https://management.azure.com/subscriptions/91d9572d-0f0b-47fe-802d-0eef36d7c719/resourceGroups/rg-hidi-prod/providers/Microsoft.App/containerApps/' + name + '?api-version=2025-07-01')
cloud.app = app_state
def main():
    private = Path(os.environ['RUNNER_TEMP']) / 'hidi-order-readiness-private'
    private.mkdir(exist_ok=True); private.chmod(0o700)
    states = {}
    for name in ['hidi-api', 'hidi-web']:
        data = cloud.app(name); state = cloud.snapshot(data); cloud.ready(state)
        path = private / (name + '.json'); path.write_text(json.dumps(data)); path.chmod(0o600)
        states[name] = data
    data = states['hidi-api']
    env = {item['name']: item.get('value') for item in data['properties']['template']['containers'][0].get('env', [])}
    database = env.get('AZURE_SQL_DATABASE'); assert database, 'Captured database missing'
    packed = base64.b64encode(gzip.compress((ROOT / 'order-notifications/readiness.mjs').read_bytes(), mtime=0)).decode()
    lines = ['node --input-type=commonjs - ' + shlex.quote(database) + " <<'HIDI_ORDER_READINESS_NODE'", 'const packed=[']
    lines += [json.dumps(packed[i:i+1800]) + ',' for i in range(0, len(packed), 1800)]
    lines += ["].join('');", 'const moduleBytes=require("node:zlib").gunzipSync(Buffer.from(packed,"base64"));', 'import("data:text/javascript;base64,"+moduleBytes.toString("base64")).then(m=>m.run(process.argv[2])).catch(e=>{console.log("HIDI_ORDER_READINESS_FAILED::"+JSON.stringify({name:String(e.name).slice(0,60),code:String(e.code).slice(0,60),message:String(e.message).replace(/eyJ[A-Za-z0-9_.-]+/g,"[redacted]").slice(0,250)}));process.exitCode=1;});', 'HIDI_ORDER_READINESS_NODE', 'exit']
    assert all(len(line.encode()) < 2000 for line in lines)
    command = '\n'.join(lines) + '\n'
    master, slave = pty.openpty()
    process = subprocess.Popen(['az', 'containerapp', 'exec', '-g', 'rg-hidi-prod', '-n', 'hidi-api', '--revision', data['properties']['latestReadyRevisionName'], '--container', data['properties']['template']['containers'][0]['name'], '--command', '/bin/sh', '--only-show-errors'], stdin=slave, stdout=slave, stderr=slave, start_new_session=True)
    os.close(slave); os.set_blocking(master, False)
    output = b''; pending = b''; sent = False; report = None
    try:
        deadline = time.monotonic() + 180
        while time.monotonic() < deadline:
            readable, writable, _ = select.select([master], [master] if pending else [], [], 1)
            if writable:
                try: pending = pending[os.write(master, pending[:2048]):]
                except BlockingIOError: pass
            if readable:
                try: chunk = os.read(master, 65536)
                except BlockingIOError: continue
                except OSError: break
                if not chunk: break
                output += chunk
                plain = terminal.terminal_text(output.decode(errors='replace'))
                if not sent and re.search(r'(?:^|[\r\n])[^\r\n]{0,160}[#$] $', plain): pending = command.encode(); sent = True
                report = terminal.complete_marker(plain, 'HIDI_ORDER_READINESS')
                if report is not None or terminal.complete_marker(plain, 'HIDI_ORDER_READINESS_FAILED') is not None: break
            if process.poll() is not None: break
        if report is None:
            plain = terminal.terminal_text(output.decode(errors='replace'))
            failure = terminal.complete_marker(plain, 'HIDI_ORDER_READINESS_FAILED')
            if failure: print(json.dumps({'privateReadinessFailure':failure}))
            else:
                print(json.dumps({'consoleExitCode':process.poll(),'consoleDiagnostics':[line[:300] for line in plain.splitlines() if re.search(r'ERROR|Error|failed|Failed|Connected|connected|Session',line) and len(line)<500][-8:]}))
        assert report is not None, 'Private order readiness incomplete; no live images changed'
        assert report.get('readOnly') is True
        fields = ['apiModuleInstalled','queueTableExists','notificationWorkerEnabled','activationCutoffConfigured','whatsappEnabled']
        assert all(type(report.get(k)) is bool for k in fields)
        assert set(report['msg91']) == {'authConfigured','businessNumberConfigured','prepaidTemplateConfigured','codTemplateConfigured','namespaceConfigured'}
        assert all(type(v) is bool for v in report['msg91'].values()) and all(type(v) is bool for v in report['queueCapabilities'].values())
        for name, old in states.items(): assert cloud.snapshot(cloud.app(name)) == cloud.snapshot(old), 'Live state changed during preflight'
        evidence = Path('evidence/order-notifications'); evidence.mkdir(parents=True, exist_ok=True)
        assert all(type(v) is bool for v in report['sms'].values())
        safe = {k: report[k] for k in ['readOnly', *fields, 'msg91', 'queueCapabilities', 'sms']}
        safe['states'] = {name: cloud.snapshot(value) for name, value in states.items()}
        (evidence / 'readiness.json').write_text(json.dumps(safe, indent=2))
        print(json.dumps({k:v for k,v in safe.items() if k != 'states'}))
    finally:
        os.close(master)
        if process.poll() is None:
            process.terminate()
            try: process.wait(timeout=10)
            except subprocess.TimeoutExpired: process.kill(); process.wait(timeout=10)
if __name__ == '__main__':
    try: main()
    except Exception as error:
        print(str(error) if isinstance(error, (AssertionError, cloud.AzureOperationError)) else 'Private order readiness failed; no live images changed')
        raise SystemExit(1)
