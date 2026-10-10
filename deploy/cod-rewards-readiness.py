"""Read wallet invariants through the existing private API console without changing settings."""
import base64, json, os, pathlib, pty, re, select, shlex, subprocess, time

root = pathlib.Path(__file__).resolve().parent
data = json.loads((pathlib.Path(os.environ['RUNNER_TEMP']) / 'hidi-cod-private/hidi-api.json').read_text())
env = {item['name']: item.get('value') for item in data['properties']['template']['containers'][0]['env']}
database = env['AZURE_SQL_DATABASE']
assert database
source = base64.b64encode((root / 'cod-rewards-readiness.mjs').read_bytes()).decode()
expression = 'eval(Buffer.from(' + json.dumps(source) + ',"base64").toString())'
command = 'node -e ' + shlex.quote(expression) + ' ' + shlex.quote(database) + '; exit\n'
master, slave = pty.openpty()
process = subprocess.Popen(['az','containerapp','exec','-g','rg-hidi-prod','-n','hidi-api','--revision',data['properties']['latestReadyRevisionName'],'--container',data['properties']['template']['containers'][0]['name'],'--command','/bin/sh','--only-show-errors'],stdin=slave,stdout=slave,stderr=slave,start_new_session=True)
os.close(slave)
output = b''
try:
    # The pseudo-terminal buffers input until the console connection is ready.
    os.write(master, command.encode())
    deadline = time.monotonic() + 150
    while time.monotonic() < deadline:
        if select.select([master], [], [], 1)[0]:
            try: chunk = os.read(master, 65536)
            except OSError: break
            if not chunk: break
            output += chunk
            if b'HIDI_SQL_READINESS::{' in output or b'HIDI_SQL_READINESS_FAILED::' in output: break
        if process.poll() is not None: break
    text = output.decode(errors='replace')
    match = re.search(r'HIDI_SQL_READINESS::(\{[^\r\n]+\})', text)
    if not match:
        failure = re.search(r'HIDI_SQL_READINESS_FAILED::([A-Za-z0-9_]+)', text)
        raise RuntimeError('Private runtime wallet readiness failed: ' + (failure.group(1) if failure else 'CONSOLE_CHECK_INCOMPLETE'))
    report = json.loads(match.group(1))
    assert report['passed'] and report['readOnly'] and report['database'] == database
    pathlib.Path('evidence/cod-rewards/sql-readiness.json').write_text(json.dumps(report, indent=2))
    print('PASS: live wallet schema, append-only ledger and balances verified read-only through the existing private runtime')
finally:
    os.close(master)
    if process.poll() is None:
        process.terminate()
        try: process.wait(timeout=10)
        except subprocess.TimeoutExpired: process.kill(); process.wait(timeout=10)
