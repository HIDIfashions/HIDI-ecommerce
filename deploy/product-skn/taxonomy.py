"""Private, guarded, create-only launch taxonomy setup after SKN schema readiness."""
import argparse
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import pty
import re
import select
import subprocess
import time

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('hidi_skn_private_schema_transport', HERE / 'schema-check.py')
transport = importlib.util.module_from_spec(spec)
spec.loader.exec_module(transport)


class PrivateTaxonomyError(RuntimeError):
    pass


def save(path, report):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(report, indent=2) + '\n')


def validate_report(report, database):
    allowed = {'passed', 'mode', 'databaseHash', 'taxonomyReady', 'categoriesReady', 'collectionsReady',
               'categoriesChecked', 'collectionsChecked', 'categoriesCreated', 'collectionsCreated', 'rowsCreated',
               'existingRowsModified', 'productAssignmentsModified', 'productsModified', 'stockModified',
               'mediaModified', 'heroModified', 'configurationModified', 'ddlExecuted', 'schemaChanged',
               'applicationRowsReturned'}
    assert set(report) == allowed, 'Unexpected taxonomy report fields'
    assert report['databaseHash'] == hashlib.sha256(database.encode()).hexdigest(), 'Database target hash differs'
    assert report['mode'] == 'ensure', 'Taxonomy setup did not finish in ensure mode'
    for key in ['passed', 'taxonomyReady', 'categoriesReady', 'collectionsReady']:
        assert report[key] is True, 'Taxonomy readiness invariant missing'
    for key in ['existingRowsModified', 'productAssignmentsModified', 'productsModified', 'stockModified',
                'mediaModified', 'heroModified', 'configurationModified', 'ddlExecuted', 'schemaChanged', 'applicationRowsReturned']:
        assert report[key] is False, 'Taxonomy setup crossed its create-only scope'
    assert type(report['categoriesChecked']) is int and report['categoriesChecked'] == 3
    assert type(report['collectionsChecked']) is int and report['collectionsChecked'] == 4
    for key, maximum in [('categoriesCreated', 3), ('collectionsCreated', 4), ('rowsCreated', 7)]:
        assert type(report[key]) is int and 0 <= report[key] <= maximum, 'Invalid bounded taxonomy count'
    assert report['rowsCreated'] == report['categoriesCreated'] + report['collectionsCreated'], 'Taxonomy create counts differ'
    assert len(json.dumps(report)) <= 2048, 'Taxonomy report exceeds bounded size'


def main():
    private = Path(os.environ.get('HIDI_SKN_PRIVATE_DIR', str(Path(os.environ.get('RUNNER_TEMP', '/tmp')) / 'hidi-product-skn-private')))
    report_path = Path(os.environ.get('HIDI_SKN_TAXONOMY_REPORT', 'evidence/product-skn/taxonomy-ready.json'))
    schema_path = Path(os.environ.get('HIDI_SKN_SCHEMA_REPORT', os.environ.get('HIDI_SKN_REPORT_PATH', 'evidence/product-skn/schema-verify.json')))
    captured = {}
    for name in ['hidi-api', 'hidi-web']:
        data = json.loads((private / (name + '.json')).read_text()); state = transport.snapshot(data)
        assert state['mode'] == 'Single' and state['latest'] == state['ready'] and state['ready'], 'Captured application is not stable and ready'
        assert re.fullmatch(re.escape('acrhidiprod0927.azurecr.io/' + name) + r'@sha256:[a-f0-9]{64}', state['image']), 'Capture requires immutable retained image'
        assert transport.snapshot(transport.app(name)) == state, 'Application changed after private capture'
        captured[name] = data
    data = captured['hidi-api']; api_state = transport.snapshot(data)
    env = {item['name']: item.get('value') for item in data['properties']['template']['containers'][0].get('env', [])}
    database = env.get('AZURE_SQL_DATABASE')
    assert isinstance(database, str) and database, 'Captured API database setting missing'
    schema = json.loads(schema_path.read_text())
    assert schema.get('passed') is True and (schema.get('schemaReady') is True or schema.get('featureReady') is True), 'SKN schema readiness is required before taxonomy setup'
    assert schema.get('databaseHash') == hashlib.sha256(database.encode()).hexdigest(), 'Schema report targets a different database'
    assert schema.get('apiImage') == api_state['image'] and schema.get('apiSettingsHash') == api_state['settingsHash'], 'Schema report differs from the fresh captured API'
    command = transport.console_command((HERE / 'taxonomy.mjs').read_text(), database, 'ensure')
    master, slave = pty.openpty()
    process = subprocess.Popen(['az', 'containerapp', 'exec', '-g', transport.GROUP, '-n', 'hidi-api',
                                '--revision', data['properties']['latestReadyRevisionName'],
                                '--container', data['properties']['template']['containers'][0]['name'],
                                '--command', '/bin/sh', '--only-show-errors'],
                               stdin=slave, stdout=slave, stderr=slave, start_new_session=True)
    os.close(slave); os.set_blocking(master, False)
    output = b''; sent = False; pending = b''
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
                assert len(output) < 512 * 1024, 'Private taxonomy console output exceeded its bound'
                plain = transport.terminal_text(output.decode(errors='replace'))
                if not sent and re.search(r'(?:^|[\r\n])[^\r\n]{0,160}[#$] $', plain):
                    pending = command.encode(); sent = True
                if transport.complete_marker(plain, transport.MARKER) is not None or transport.complete_marker(plain, transport.FAILURE_MARKER) is not None: break
            if process.poll() is not None: break
        plain = transport.terminal_text(output.decode(errors='replace'))
        report = transport.complete_marker(plain, transport.MARKER)
        if report is None:
            failure = transport.complete_marker(plain, transport.FAILURE_MARKER) or {}
            code = failure.get('failureCode')
            if not isinstance(code, str) or not re.fullmatch(r'[A-Z][A-Z0-9_]{0,79}', code): code = 'PRIVATE_TAXONOMY_INCOMPLETE'
            save(report_path, {'passed': False, 'taxonomyReady': False, 'ddlExecuted': False,
                               'schemaChanged': False, 'consoleCommandSent': sent, 'failureCode': code})
            raise PrivateTaxonomyError('Private taxonomy setup did not finish: ' + code)
        validate_report(report, database)
        for name, previous in captured.items():
            assert transport.snapshot(transport.app(name)) == transport.snapshot(previous), 'Application changed during private taxonomy setup'
        report.update({'apiImage': api_state['image'], 'apiSettingsHash': api_state['settingsHash'],
                       'schemaReady': True, 'privateNetwork': True, 'managedIdentity': True})
        save(report_path, report)
        print('PASS: taxonomy references ready; ' + str(report['rowsCreated']) + ' missing rows created; existing rows unchanged')
    finally:
        os.close(master)
        if process.poll() is None:
            process.terminate()
            try: process.wait(timeout=10)
            except subprocess.TimeoutExpired: process.kill(); process.wait(timeout=10)


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--ensure', action='store_true', required=True)
    parser.parse_args()
    try: main()
    except Exception as error:
        print(str(error) if isinstance(error, (AssertionError, PrivateTaxonomyError, transport.PrivateCheckError)) else 'Private taxonomy setup stopped; inspect bounded evidence')
        raise SystemExit(1)
