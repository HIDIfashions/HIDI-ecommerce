"""Apply the reviewed additive Product CHECK via the retained private API identity.

The widened CHECK remains after image rollback, since existing tombstones may
depend on it. No secrets, terminal transcript or private environment is exported.
"""
import base64
import hashlib
import gzip
import importlib.util
import json
import os
import pathlib
import pty
import re
import select
import shlex
import subprocess
import time

HERE = pathlib.Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('admin_delete_schema_release', HERE / 'release.py')
release = importlib.util.module_from_spec(spec); spec.loader.exec_module(release)
MIGRATION = release.SCHEMA_MIGRATION

def console_command(packed, database):
    # A quoted heredoc preserves bytes without files or shell expansion. Every
    # input line stays below the private terminal's canonical input limit.
    lines = ['node --input-type=commonjs - ' + shlex.quote(database) + " <<'HIDI_DELETE_SCHEMA_NODE'", 'const packed = [']
    lines += [json.dumps(packed[start:start + 1800]) + ',' for start in range(0, len(packed), 1800)]
    lines += ['].join(\'\');', 'const payload=JSON.parse(require("node:zlib").gunzipSync(Buffer.from(packed,"base64")).toString());', 'import("data:text/javascript;base64,"+Buffer.from(payload.module).toString("base64")).then(module=>module.run(payload.migration,process.argv[2])).catch(error=>{console.log("HIDI_DELETE_SCHEMA_FAILED::"+String(error?.code||error?.name||"SCHEMA_FAILED").replace(/[^A-Za-z0-9_]/g,""));process.exitCode=1;});', 'HIDI_DELETE_SCHEMA_NODE', 'exit']
    assert all(len(line.encode()) < 2000 for line in lines), 'Schema input line exceeds the safe console limit'
    return '\n'.join(lines) + '\n'

def verify_report(report, database, migration):
    assert report.get('passed') is True and report.get('databaseHash') == hashlib.sha256(database.encode()).hexdigest(), 'Schema readiness database did not match capture'
    assert report.get('migrationSha256') == hashlib.sha256(migration).hexdigest(), 'Schema readiness used different migration bytes'
    assert report.get('allowedStatuses') == ['ACTIVE', 'ARCHIVED', 'DELETED', 'DRAFT']
    for field in ['additiveConstraint', 'trustedConstraint', 'foreignKeysPreserved', 'unrelatedChecksPreserved', 'columnPreserved', 'keepOnImageRollback']:
        assert report.get(field) is True, 'Schema readiness invariant missing: ' + field
    assert report.get('applicationRowsModified') is False, 'Application row changes are not part of this migration'

def main():
    states = {}
    for name in ['hidi-api', 'hidi-web']:
        data = json.loads((release.private / (name + '.json')).read_text())
        state = release.cloud.snapshot(data)
        assert release.cloud.snapshot(release.cloud.app(name)) == state, 'Live state changed before schema readiness'
        backup = json.loads((release.evidence / (name.removeprefix('hidi-') + '-backup.json')).read_text())
        assert backup.get('verified') is True and backup.get('originalImage') == state['image'] and backup.get('digest') == state['image'].split('@', 1)[1], 'Verified live backup required before schema readiness'
        states[name] = data
    data = states['hidi-api']; baseline = release.cloud.snapshot(data)
    env = {item['name']: item.get('value') for item in data['properties']['template']['containers'][0].get('env', [])}
    database = env.get('AZURE_SQL_DATABASE'); assert database, 'Captured Azure SQL database missing'
    migration = MIGRATION.read_bytes()
    payload = json.dumps({'module': (HERE / 'schema-readiness.mjs').read_text(), 'migration': migration.decode()}, separators=(',', ':')).encode()
    packed = base64.b64encode(gzip.compress(payload, mtime=0)).decode()
    command = console_command(packed, database)
    master, slave = pty.openpty()
    process = subprocess.Popen(['az', 'containerapp', 'exec', '-g', 'rg-hidi-prod', '-n', 'hidi-api', '--revision', data['properties']['latestReadyRevisionName'], '--container', data['properties']['template']['containers'][0]['name'], '--command', '/bin/sh', '--only-show-errors'], stdin=slave, stdout=slave, stderr=slave, start_new_session=True)
    os.close(slave); os.set_blocking(master, False); output = b''; sent = False; pending = b''
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
                plain = re.sub(r'\x1b\[[0-?]*[ -/]*[@-~]', '', output.decode(errors='replace'))
                if not sent and re.search(r'(?:^|[\r\n])[^\r\n]{0,160}[#$] $', plain):
                    pending = command.encode(); sent = True
                if re.search(rb'HIDI_DELETE_SCHEMA::\{[^\r\n]+\}', output) or re.search(rb'HIDI_DELETE_SCHEMA_FAILED::[A-Za-z0-9_]+\r?\n', output): break
            if process.poll() is not None: break
        text = output.decode(errors='replace')
        match = re.search(r'HIDI_DELETE_SCHEMA::(\{[^\r\n]+\})', text)
        if not match:
            failure = re.search(r'HIDI_DELETE_SCHEMA_FAILED::([A-Za-z0-9_]+)', text)
            report = {'passed': False, 'consoleCommandSent': sent, 'consoleExitCode': process.poll(), 'azureErrorCodes': re.findall(r'ERROR:\s*\(([A-Za-z0-9_.-]+)\)', text), 'failureCode': failure.group(1) if failure else 'CONSOLE_CHECK_INCOMPLETE', 'additiveConstraintKeptOnImageRollback': True}
            release.save('schema-failure.json', report)
            raise RuntimeError('Private Product schema readiness failed: ' + report['failureCode'])
        report = json.loads(match.group(1)); verify_report(report, database, migration)
        for name, previous in states.items():
            assert release.cloud.snapshot(release.cloud.app(name)) == release.cloud.snapshot(previous), 'Live state changed during schema readiness'
        report.update({'apiImage': baseline['image'], 'apiSettingsHash': baseline['settingsHash'], 'privateNetwork': True, 'managedIdentity': True})
        release.save('schema-ready.json', report)
        print('PASS: trusted Product deletion CHECK verified through the retained private identity; rows, foreign keys and other schema retained')
    finally:
        os.close(master)
        if process.poll() is None:
            process.terminate()
            try: process.wait(timeout=10)
            except subprocess.TimeoutExpired: process.kill(); process.wait(timeout=10)

if __name__ == '__main__':
    try: main()
    except Exception as error:
        print(str(error) if isinstance(error, (AssertionError, RuntimeError, release.cloud.AzureOperationError)) else 'Private Product schema readiness stopped; inspect sanitized evidence')
        raise SystemExit(1)
