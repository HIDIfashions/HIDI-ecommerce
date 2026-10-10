"""Read existing Product metadata and DML capabilities through the private API.

No schema, application rows, identities or permissions are changed. No secrets,
terminal transcript or private environment are exported.
"""
import base64
import argparse
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

def console_command(packed, database, diagnose=False):
    # A quoted heredoc preserves bytes without files or shell expansion. Every
    # input line stays below the private terminal's canonical input limit.
    lines = ['node --input-type=commonjs - ' + shlex.quote(database) + " <<'HIDI_DELETE_SCHEMA_NODE'", 'const packed = [']
    lines += [json.dumps(packed[start:start + 1800]) + ',' for start in range(0, len(packed), 1800)]
    method = 'module.diagnose(process.argv[2])' if diagnose else 'module.run(process.argv[2])'
    lines += ['].join(\'\');', 'const payload=JSON.parse(require("node:zlib").gunzipSync(Buffer.from(packed,"base64")).toString());', 'import("data:text/javascript;base64,"+Buffer.from(payload.module).toString("base64")).then(module=>' + method + ').catch(error=>{const code=/^[A-Z][A-Z0-9_]{0,79}$/.test(String(error?.code))?error.code:"SCHEMA_HELPER_FAILED";console.log("HIDI_DELETE_SCHEMA_FAILED::"+JSON.stringify({failureCode:code,...(error?.schemaDiagnostics?{diagnostics:error.schemaDiagnostics}:{})}));process.exitCode=1;});', 'HIDI_DELETE_SCHEMA_NODE', 'exit']
    assert all(len(line.encode()) < 2000 for line in lines), 'Schema input line exceeds the safe console limit'
    return '\n'.join(lines) + '\n'

def verify_report(report, database):
    assert report.get('passed') is True and report.get('databaseHash') == hashlib.sha256(database.encode()).hexdigest(), 'Schema readiness database did not match capture'
    for field in ['readOnly', 'existingProductSchema', 'trustedConstraint', 'productColumnsVerified', 'dmlCapabilitiesVerified']:
        assert report.get(field) is True, 'Schema readiness invariant missing: ' + field
    for field in ['applicationRowsQueried', 'applicationRowsModified', 'ddlExecuted', 'schemaChanged']:
        assert report.get(field) is False, 'Read-only schema metadata verification required: ' + field
    for prefix, expected_bytes in [('column', 80), ('slugColumn', 382)]:
        assert report.get(prefix + 'Type') == 'nvarchar' and report.get(prefix + 'MaxLength') == expected_bytes and report.get(prefix + 'Nullable') is False, 'Existing Product column metadata mismatch: ' + prefix

def terminal_text(text):
    return re.sub(r'\x1b\[[0-?]*[ -/]*[@-~]', '', text)

def parse_failure(text):
    text = terminal_text(text)
    match = re.search(r'HIDI_DELETE_SCHEMA_FAILED::(\{[^\r\n]+\})', text)
    if not match: return {'failureCode': 'CONSOLE_CHECK_INCOMPLETE'}
    try: value = json.loads(match.group(1))
    except (ValueError, TypeError): return {'failureCode': 'SCHEMA_FAILURE_REPORT_INVALID'}
    code = value.get('failureCode')
    report = {'failureCode': code if isinstance(code, str) and re.fullmatch(r'[A-Z][A-Z0-9_]{0,79}', code) else 'SCHEMA_HELPER_FAILED'}
    diagnostics = value.get('diagnostics')
    if isinstance(diagnostics, dict):
        # The helper produces this bounded allowlist; reject arbitrary exception
        # details even if a future console/module accidentally appends them.
        safe = {}
        for key in ['constraintCount', 'columnCount', 'columnMaxLength', 'slugColumnCount', 'slugColumnMaxLength']:
            if type(diagnostics.get(key)) is int: safe[key] = diagnostics[key]
        for key in ['constraintPresent', 'constraintEnabled', 'constraintTrusted', 'constraintDefinitionVisible', 'columnPresent', 'columnNullable', 'slugColumnPresent', 'slugColumnNullable']:
            if diagnostics.get(key) is None or type(diagnostics.get(key)) is bool: safe[key] = diagnostics.get(key)
        for key in ['columnType', 'slugColumnType']:
            if diagnostics.get(key) is None or isinstance(diagnostics.get(key), str) and re.fullmatch(r'[a-z0-9_]{1,40}', diagnostics[key]): safe[key] = diagnostics.get(key)
        statuses = diagnostics.get('statusLiterals')
        if isinstance(statuses, list) and len(statuses) <= 20 and all(isinstance(value, str) and (value == '[REDACTED]' or re.fullmatch(r'[A-Z_]{1,40}', value)) for value in statuses): safe['statusLiterals'] = statuses
        report['diagnostics'] = safe
    return report

def complete_marker(text, marker):
    # Terminal reads may end at an inner object's closing brace. Wait for the
    # whole emitted line and valid JSON before closing the private console.
    # Both the remote shell and local PTY can translate LF to CRLF. Accept
    # CRCRLF as well as LF/CRLF, and strip terminal decoration consistently.
    text = terminal_text(text)
    for match in re.finditer(re.escape(marker) + r'::(\{[^\r\n]+\})\r*\n', text):
        try:
            value = json.loads(match.group(1))
            if isinstance(value, dict): return value
        except (ValueError, TypeError): continue
    return None

def main(diagnose=False):
    states = {}
    for name in ['hidi-api', 'hidi-web']:
        data = json.loads((release.private / (name + '.json')).read_text())
        state = release.cloud.snapshot(data)
        assert release.cloud.snapshot(release.cloud.app(name)) == state, 'Live state changed before schema readiness'
        if not diagnose:
            backup = json.loads((release.evidence / (name.removeprefix('hidi-') + '-backup.json')).read_text())
            assert backup.get('verified') is True and backup.get('originalImage') == state['image'] and backup.get('digest') == state['image'].split('@', 1)[1], 'Verified live backup required before schema readiness'
        states[name] = data
    data = states['hidi-api']; baseline = release.cloud.snapshot(data)
    env = {item['name']: item.get('value') for item in data['properties']['template']['containers'][0].get('env', [])}
    database = env.get('AZURE_SQL_DATABASE'); assert database, 'Captured Azure SQL database missing'
    payload = json.dumps({'module': (HERE / 'schema-readiness.mjs').read_text()}, separators=(',', ':')).encode()
    packed = base64.b64encode(gzip.compress(payload, mtime=0)).decode()
    command = console_command(packed, database, diagnose)
    marker = 'HIDI_DELETE_SCHEMA_DIAGNOSTIC' if diagnose else 'HIDI_DELETE_SCHEMA'
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
                plain = terminal_text(output.decode(errors='replace'))
                if not sent and re.search(r'(?:^|[\r\n])[^\r\n]{0,160}[#$] $', plain):
                    pending = command.encode(); sent = True
                if complete_marker(plain, marker) is not None or complete_marker(plain, 'HIDI_DELETE_SCHEMA_FAILED') is not None: break
            if process.poll() is not None: break
        text = terminal_text(output.decode(errors='replace'))
        report = complete_marker(text, marker)
        if report is None:
            report = {'passed': False, 'consoleCommandSent': sent, 'consoleExitCode': process.poll(), 'azureErrorCodes': re.findall(r'ERROR:\s*\(([A-Za-z0-9_.-]+)\)', text), **parse_failure(text), 'readOnlyDiagnostic': diagnose, 'ddlExecuted': False}
            release.save('schema-failure.json', report)
            raise RuntimeError('Private Product schema readiness failed: ' + report['failureCode'])
        if diagnose:
            assert report.get('readOnly') is True and report.get('applicationRowsQueried') is False and report.get('ddlExecuted') is False, 'Diagnostic helper must only inspect schema metadata'
        else: verify_report(report, database)
        for name, previous in states.items():
            assert release.cloud.snapshot(release.cloud.app(name)) == release.cloud.snapshot(previous), 'Live state changed during schema readiness'
        report.update({'apiImage': baseline['image'], 'apiSettingsHash': baseline['settingsHash'], 'privateNetwork': True, 'managedIdentity': True})
        release.save('schema-diagnostic.json' if diagnose else 'schema-ready.json', report)
        print('PASS: read-only Product schema diagnostic saved' if diagnose else 'PASS: existing Product columns and effective DML permissions verified read-only through the retained private identity')
    finally:
        os.close(master)
        if process.poll() is None:
            process.terminate()
            try: process.wait(timeout=10)
            except subprocess.TimeoutExpired: process.kill(); process.wait(timeout=10)

if __name__ == '__main__':
    parser = argparse.ArgumentParser(); mode = parser.add_mutually_exclusive_group(required=True); mode.add_argument('--diagnose', action='store_true'); mode.add_argument('--verify-existing-schema', action='store_true'); args = parser.parse_args()
    try: main(args.diagnose)
    except Exception as error:
        print(str(error) if isinstance(error, (AssertionError, RuntimeError, release.cloud.AzureOperationError)) else 'Private Product schema readiness stopped; inspect sanitized evidence')
        raise SystemExit(1)
