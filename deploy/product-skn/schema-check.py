"""Read-only private SQL readiness through a fresh captured API revision.

No Azure settings, SQL schema/rows, identities, permissions, backups or secrets
are mutated. Captured configuration and terminal output remain private.
"""
import argparse
import base64
import copy
import gzip
import hashlib
import json
import os
from pathlib import Path
import pty
import re
import select
import shlex
import subprocess
import time

HERE = Path(__file__).resolve().parent
GROUP = 'rg-hidi-prod'
MARKER = 'HIDI_SKN_SCHEMA'
FAILURE_MARKER = 'HIDI_SKN_SCHEMA_FAILED'


class PrivateCheckError(RuntimeError):
    pass


def snapshot(data):
    properties = data['properties']
    value = copy.deepcopy(data)
    template = value['properties']['template']; template.pop('revisionSuffix', None)
    assert len(template['containers']) == 1, 'Expected one retained application container'
    image = template['containers'][0].pop('image')
    template['containers'][0]['env'] = sorted(template['containers'][0].get('env', []), key=lambda item: item['name'])
    for item in template['containers'][0]['env']:
        if item.get('secretRef') and item.get('value') in (None, ''): item.pop('value', None)
    configuration = value['properties']['configuration']; configuration.get('ingress', {}).pop('traffic', None)
    protected = {'template': template, 'configuration': configuration, 'identity': value.get('identity'),
                 'tags': value.get('tags'), 'location': value.get('location'), 'environmentId': properties.get('environmentId'),
                 'managedEnvironmentId': properties.get('managedEnvironmentId'), 'workloadProfileName': properties.get('workloadProfileName')}
    return {'image': image, 'settingsHash': hashlib.sha256(json.dumps(protected, sort_keys=True).encode()).hexdigest(),
            'latest': properties['latestRevisionName'], 'ready': properties.get('latestReadyRevisionName'),
            'mode': properties['configuration']['activeRevisionsMode']}


def app(name):
    result = subprocess.run(['az', 'containerapp', 'show', '-g', GROUP, '-n', name,
                             '--only-show-errors', '-o', 'json'], capture_output=True, text=True, timeout=60)
    if result.returncode:
        match = re.search(r'ERROR:\s*\(([A-Za-z0-9_.-]{1,100})\)', result.stderr)
        raise PrivateCheckError('Azure read-only inspection rejected: ' + (match.group(1) if match else 'AZURE_INSPECTION_FAILED'))
    return json.loads(result.stdout)


def console_command(module, database, mode, owner_payload=None):
    payload = {'module': module, 'owner': owner_payload}
    packed = base64.b64encode(gzip.compress(json.dumps(payload, separators=(',', ':')).encode(), mtime=0)).decode()
    lines = ['node --input-type=commonjs - ' + shlex.quote(database) + " <<'HIDI_SKN_SCHEMA_NODE'", 'const packed = [']
    lines += [json.dumps(packed[start:start + 1800]) + ',' for start in range(0, len(packed), 1800)]
    lines += ["].join('');", 'const payload=JSON.parse(require("node:zlib").gunzipSync(Buffer.from(packed,"base64")).toString());',
              'import("data:text/javascript;base64,"+Buffer.from(payload.module).toString("base64")).then(module=>module.' + mode + '(process.argv[2],payload.owner)).catch(error=>{const code=/^[A-Z][A-Z0-9_]{0,79}$/.test(String(error?.code))?error.code:"SCHEMA_CHECK_FAILED";console.log("' + FAILURE_MARKER + '::"+JSON.stringify({failureCode:code}));process.exitCode=1;});',
              'HIDI_SKN_SCHEMA_NODE', 'exit']
    assert all(len(line.encode()) < 2000 for line in lines), 'Private console line limit exceeded'
    return '\n'.join(lines) + '\n'


def terminal_text(value):
    return re.sub(r'\x1b\[[0-?]*[ -/]*[@-~]', '', value)


def complete_marker(output, marker):
    for match in re.finditer(re.escape(marker) + r'::(\{[^\r\n]{1,16384}\})\r*\n', terminal_text(output)):
        try:
            value = json.loads(match.group(1))
            if isinstance(value, dict): return value
        except (ValueError, TypeError): pass
    return None


def validate_report(report, database, mode):
    assert report.get('databaseHash') == hashlib.sha256(database.encode()).hexdigest(), 'Database target hash differs'
    assert report.get('passed') is True and report.get('mode') == mode, 'SQL check did not finish in the requested mode'
    assert report.get('readOnly') is (mode != 'migrateOwner'), 'SQL check mode/scope differs'
    for field in ['applicationRowsReturned', 'taxonomyChecked']:
        assert report.get(field) is False, 'SQL check unexpectedly crossed its read-only scope'
    if mode == 'migrateOwner':
        for field in ['ownerMigrationExecuted', 'ownerDefinitionsVerified', 'definitionsVerified', 'pitrCheckpointVerified']:
            assert report.get(field) is True, 'Owner migration verification missing'
        for field in ['existingProductRowsModified', 'identityOrPermissionChanges']:
            assert report.get(field) is False, 'Owner migration crossed its additive scope'
        for field in ['ddlExecuted', 'schemaChanged', 'applicationRowsModified']:
            assert type(report.get(field)) is bool, 'Owner migration scope flag missing'
        for field in ['migrationSha256', 'pitrCheckpointHash', 'ownerSchemaHash']:
            assert isinstance(report.get(field), str) and re.fullmatch(r'[a-f0-9]{64}', report[field]), 'Owner migration checksum missing'
        for field in ['mappingRowsInserted', 'pitrCheckpointAgeSeconds']:
            assert type(report.get(field)) is int and 0 <= report[field] <= 2**53 - 1, 'Owner migration bounded count missing'
    else:
        for field in ['ddlExecuted', 'schemaChanged', 'applicationRowsModified']:
            assert report.get(field) is False, 'Read-only SQL check invariant missing'
    assert type(report.get('featureReady')) is bool and type(report.get('ddlAuthorized')) is bool
    for field in ['productCount', 'mappingCount', 'unmappedProductCount', 'invalidSknCount', 'reservedDeletedProductCount', 'sequenceCurrentValue']:
        assert report.get(field) is None or type(report[field]) is int and 0 <= report[field] <= 2**53 - 1, 'Invalid bounded SQL count'
    for field in ['ddlCapabilities', 'dmlCapabilities']:
        assert isinstance(report.get(field), dict) and len(report[field]) <= 10 and all(type(value) is bool for value in report[field].values()), 'Invalid capability flags'
    requirements = report.get('missingRequirements')
    assert isinstance(requirements, list) and len(requirements) <= 20 and all(isinstance(value, str) and re.fullmatch(r'[A-Z][A-Z0-9_]{0,79}', value) for value in requirements), 'Invalid readiness requirements'
    assert len(json.dumps(report)) <= 16384, 'Schema report exceeds bounded size'


def save(path, report):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(report, indent=2) + '\n')


def main(mode):
    private = Path(os.environ.get('HIDI_SKN_PRIVATE_DIR', str(Path(os.environ.get('RUNNER_TEMP', '/tmp')) / 'hidi-product-skn-private')))
    report_path = Path(os.environ.get('HIDI_SKN_SCHEMA_REPORT', os.environ.get('HIDI_SKN_REPORT_PATH', 'evidence/product-skn/schema-' + mode + '.json')))
    captured = {}
    for name in ['hidi-api', 'hidi-web']:
        path = private / (name + '.json')
        if name == 'hidi-web' and not path.exists(): continue
        data = json.loads(path.read_text()); state = snapshot(data)
        assert state['mode'] == 'Single' and state['latest'] == state['ready'] and state['ready'], 'Captured application is not stable and ready'
        assert re.fullmatch(re.escape('acrhidiprod0927.azurecr.io/' + name) + r'@sha256:[a-f0-9]{64}', state['image']), 'Capture requires immutable retained image'
        assert snapshot(app(name)) == state, 'Application changed after private capture'
        captured[name] = data
    data = captured['hidi-api']; api_state = snapshot(data)
    env = {item['name']: item.get('value') for item in data['properties']['template']['containers'][0].get('env', [])}
    database = env.get('AZURE_SQL_DATABASE')
    assert isinstance(database, str) and database, 'Captured API database setting missing'
    owner_payload = None
    if mode == 'migrateOwner':
        expected_hash = os.environ.get('HIDI_SKN_MIGRATION_SHA256')
        assert isinstance(expected_hash, str) and re.fullmatch(r'[a-f0-9]{64}', expected_hash), 'Exact reviewed migration SHA256 is required'
        migration_bytes = (HERE / 'migration.sql').read_bytes()
        assert hashlib.sha256(migration_bytes).hexdigest() == expected_hash, 'Reviewed migration file checksum differs'
        checkpoint_path = os.environ.get('HIDI_SKN_SQL_CHECKPOINT')
        assert checkpoint_path, 'Fresh passed SQL PITR checkpoint JSON is required'
        checkpoint_bytes = Path(checkpoint_path).read_bytes()
        assert len(checkpoint_bytes) <= 16384, 'SQL PITR checkpoint exceeds bounded size'
        checkpoint = json.loads(checkpoint_bytes)
        assert checkpoint.get('passed') is True and checkpoint.get('readOnly') is True and checkpoint.get('databaseOnline') is True, 'Fresh SQL PITR checkpoint must be verified'
        assert checkpoint.get('databaseHash') == hashlib.sha256(database.encode()).hexdigest(), 'SQL PITR checkpoint database target differs'
        assert checkpoint.get('apiImage') == api_state['image'] and checkpoint.get('apiSettingsHash') == api_state['settingsHash'], 'SQL PITR checkpoint API capture differs'
        owner_payload = {'migration': migration_bytes.decode(), 'proof': {'migrationSha256': expected_hash,
            'apiImage': api_state['image'], 'apiSettingsHash': api_state['settingsHash'], 'checkpoint': checkpoint}}
    command = console_command((HERE / 'schema-check.mjs').read_text(), database, mode, owner_payload)
    master, slave = pty.openpty()
    process = subprocess.Popen(['az', 'containerapp', 'exec', '-g', GROUP, '-n', 'hidi-api',
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
                assert len(output) < 512 * 1024, 'Private console output exceeded its bound'
                plain = terminal_text(output.decode(errors='replace'))
                if not sent and re.search(r'(?:^|[\r\n])[^\r\n]{0,160}[#$] $', plain):
                    pending = command.encode(); sent = True
                if complete_marker(plain, MARKER) is not None or complete_marker(plain, FAILURE_MARKER) is not None: break
            if process.poll() is not None: break
        plain = terminal_text(output.decode(errors='replace'))
        report = complete_marker(plain, MARKER)
        if report is None:
            failure = complete_marker(plain, FAILURE_MARKER) or {}
            code = failure.get('failureCode')
            if not isinstance(code, str) or not re.fullmatch(r'[A-Z][A-Z0-9_]{0,79}', code): code = 'PRIVATE_CONSOLE_CHECK_INCOMPLETE'
            scope_unknown = mode == 'migrateOwner' and code in ('PRIVATE_CONSOLE_CHECK_INCOMPLETE', 'OWNER_MIGRATION_RESULT_INVALID', 'OWNER_SCHEMA_VERIFICATION_FAILED', 'OWNER_MAPPING_COUNT_INVALID')
            save(report_path, {'passed': False, 'readOnly': mode != 'migrateOwner',
                               'ddlExecuted': None if scope_unknown else False, 'schemaChanged': None if scope_unknown else False,
                               'applicationRowsModified': None if scope_unknown else False,
                               'migrationExecutionUnconfirmed': scope_unknown, 'consoleCommandSent': sent, 'failureCode': code})
            raise PrivateCheckError('Private SQL readiness did not finish: ' + code)
        validate_report(report, database, mode)
        for name, previous in captured.items():
            assert snapshot(app(name)) == snapshot(previous), 'Application changed during private SQL check'
        report.update({'apiImage': api_state['image'], 'apiSettingsHash': api_state['settingsHash'],
                       'privateNetwork': True, 'managedIdentity': True})
        save(report_path, report)
        if mode in ('verify', 'migrateOwner') and not report['featureReady']:
            raise PrivateCheckError('Product SKN schema is not ready: ' + ', '.join(report['missingRequirements']))
        print('PASS: bounded Product SKN ' + mode + ' report saved; featureReady=' + str(report['featureReady']).lower() + ', ddlAuthorized=' + str(report['ddlAuthorized']).lower())
    finally:
        os.close(master)
        if process.poll() is None:
            process.terminate()
            try: process.wait(timeout=10)
            except subprocess.TimeoutExpired: process.kill(); process.wait(timeout=10)


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument('--checkDdl', action='store_true'); mode.add_argument('--verify', action='store_true')
    mode.add_argument('--migrate-owner', action='store_true')
    args = parser.parse_args()
    try: main('migrateOwner' if args.migrate_owner else 'checkDdl' if args.checkDdl else 'verify')
    except Exception as error:
        print(str(error) if isinstance(error, (AssertionError, PrivateCheckError)) else 'Private SQL readiness stopped; inspect bounded evidence')
        raise SystemExit(1)
