"""Run an authorized, version-checked status update through the live API service."""
import importlib.util
import json
import os
from pathlib import Path
import pty
import re
import select
import subprocess
import sys
import time

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('draft_transport', HERE.parent / 'product-skn/schema-check.py')
transport = importlib.util.module_from_spec(spec); spec.loader.exec_module(transport)
PRIVATE = Path(os.environ.get('RUNNER_TEMP', '/tmp')) / 'hidi-draft-publication-private'
EVIDENCE = Path('evidence/draft-publication')

def save(name, value):
    EVIDENCE.mkdir(parents=True, exist_ok=True)
    (EVIDENCE / name).write_text(json.dumps(value, indent=2) + '\n')

def records(text, kind):
    result = []
    for line in transport.terminal_text(text).splitlines():
        if line.startswith('HIDI_DRAFT_' + kind + '::'):
            value = json.loads(line.split('::', 1)[1]); assert isinstance(value, dict)
            result.append(value)
    return result

def main(mode):
    PRIVATE.mkdir(parents=True, exist_ok=True); PRIVATE.chmod(0o700)
    if mode == 'inspect':
        data = transport.app('hidi-api')
        config = PRIVATE / 'api.json'; config.write_text(json.dumps(data)); config.chmod(0o600)
    else:
        data = json.loads((PRIVATE / 'api.json').read_text())
        assert transport.snapshot(transport.app('hidi-api')) == transport.snapshot(data), 'API changed since draft snapshot'
    state = transport.snapshot(data)
    assert state['ready'] and state['latest'] == state['ready'] and state['mode'] == 'Single', 'API must be ready'
    env = {item['name']: item.get('value') for item in data['properties']['template']['containers'][0].get('env', [])}
    database = env.get('AZURE_SQL_DATABASE'); assert database == 'hidi-sql', 'Unexpected production database'
    payload = None
    if mode == 'publish':
        snapshot = json.loads((EVIDENCE / 'draft-snapshot.json').read_text())
        assert snapshot['report']['passed'] and snapshot['report']['draftCount'] == len(snapshot['items'])
        assert snapshot['api'] == state
        payload = {'authorization': 'Publish whatever is there in draft', 'items': snapshot['items']}
    command = transport.console_command((HERE / 'publish-saved-drafts.mjs').read_text(), database, mode, payload)
    master, slave = pty.openpty()
    process = subprocess.Popen(['az', 'containerapp', 'exec', '-g', transport.GROUP, '-n', 'hidi-api', '--revision', state['ready'],
        '--container', data['properties']['template']['containers'][0]['name'], '--command', '/bin/sh', '--only-show-errors'],
        stdin=slave, stdout=slave, stderr=slave, start_new_session=True)
    os.close(slave); os.set_blocking(master, False)
    output = b''; sent = False; pending = b''; seen = 0
    try:
        deadline = time.monotonic() + 600
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
                output += chunk; assert len(output) < 4 * 1024 * 1024, 'Console output exceeded bound'
                plain = transport.terminal_text(output.decode(errors='replace'))
                if not sent and re.search(r'(?:^|[\r\n])[^\r\n]{0,160}[#$] $', plain): pending = command.encode(); sent = True
                complete = plain[:plain.rfind('\n') + 1]
                results = records(complete, 'RESULT')
                if len(results) != seen:
                    save('publication-progress.json', {'results': results}); seen = len(results)
                    if seen % 10 == 0: print('Confirmed draft publication results: ' + str(seen), flush=True)
                if records(complete, 'REPORT') or transport.complete_marker(plain, transport.FAILURE_MARKER): break
            if process.poll() is not None: break
        plain = output.decode(errors='replace')
        reports = records(plain, 'REPORT')
        if not reports:
            failure = transport.complete_marker(plain, transport.FAILURE_MARKER) or {'failureCode': 'DRAFT_CONSOLE_INCOMPLETE'}
            save('failure.json', {'mode': mode, 'consoleCommandSent': sent, **failure})
            raise RuntimeError(failure['failureCode'])
        assert len(reports) == 1
        report = reports[0]; assert report['mode'] == mode
        if mode == 'inspect':
            items = records(plain, 'ITEM'); assert report['passed'] and report['draftCount'] == len(items)
            save('draft-snapshot.json', {'report': report, 'items': items, 'api': state})
        else:
            results = records(plain, 'RESULT'); assert len(results) == report['capturedDrafts']
            save('publication-result.json', {'report': report, 'results': results, 'api': state})
        assert transport.snapshot(transport.app('hidi-api')) == state, 'API configuration changed during publication'
        print(json.dumps(report), flush=True)
        assert report['passed'], 'Publication finished with failures; inspect results'
    finally:
        os.close(master)
        if process.poll() is None:
            process.terminate()
            try: process.wait(timeout=10)
            except subprocess.TimeoutExpired: process.kill(); process.wait(timeout=10)

if __name__ == '__main__':
    try: main(sys.argv[1])
    except Exception as error:
        print(str(error) if isinstance(error, (AssertionError, RuntimeError)) else 'Draft publication stopped; inspect bounded evidence')
        raise SystemExit(1)
