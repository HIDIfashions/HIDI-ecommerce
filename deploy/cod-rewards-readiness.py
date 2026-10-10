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
sent = False
try:
    deadline = time.monotonic() + 150
    while time.monotonic() < deadline:
        if select.select([master], [], [], 1)[0]:
            try: chunk = os.read(master, 65536)
            except OSError: break
            if not chunk: break
            output += chunk
            # Wait for the actual remote shell prompt: the CLI switches the
            # terminal to raw mode during connection and can flush early input.
            plain = re.sub(r'\x1b\[[0-?]*[ -/]*[@-~]', '', output.decode(errors='replace'))
            if not sent and re.search(r'(?:^|[\r\n])[^\r\n]{0,160}[#$] $', plain):
                os.write(master, command.encode()); sent = True
            if re.search(rb'HIDI_SQL_READINESS::\{[^\r\n]+\}', output) or re.search(rb'HIDI_SQL_READINESS_FAILED::[A-Za-z0-9_]+\r?\n', output): break
        if process.poll() is not None: break
    text = output.decode(errors='replace')
    match = re.search(r'HIDI_SQL_READINESS::(\{[^\r\n]+\})', text)
    if not match:
        failure = re.search(r'HIDI_SQL_READINESS_FAILED::([A-Za-z0-9_]+)', text)
        codes = re.findall(r'ERROR:\s*\(([A-Za-z0-9_.-]+)\)', text)
        print(json.dumps({'consoleCommandSent':sent,'consoleExitCode':process.poll(),'azureErrorCodes':codes}))
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
