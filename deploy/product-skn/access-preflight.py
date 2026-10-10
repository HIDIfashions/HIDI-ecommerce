"""Fresh read-only Azure and SQL metadata inspection. Never emits credentials or SQL rows."""
import argparse
import base64
import copy
from datetime import datetime, timezone
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
BASELINE = '38da6ad9e561e5f2c33740d863cb4bd03c8c18cd'
MARKER = 'HIDI_SKN_ACCESS'
FAILURE_MARKER = 'HIDI_SKN_ACCESS_FAILED'
PRIVATE = Path(os.environ.get('HIDI_SKN_ACCESS_PRIVATE_DIR', os.environ.get('HIDI_SKN_PRIVATE_DIR', str(Path(os.environ.get('RUNNER_TEMP', '/tmp')) / 'hidi-product-skn-access-private'))))
EVIDENCE = Path(os.environ.get('HIDI_SKN_ACCESS_EVIDENCE_DIR', 'evidence/product-skn/access-preflight'))
CHECKPOINT = Path(os.environ.get('HIDI_SKN_CHECKPOINT_REPORT', 'evidence/product-skn/sql-checkpoint.json'))


class InspectionError(RuntimeError):
    pass


def digest(value):
    return hashlib.sha256(str(value).encode()).hexdigest()


def azure(*args):
    result = subprocess.run(['az', *args, '--only-show-errors', '-o', 'json'], capture_output=True, text=True, timeout=90)
    if result.returncode:
        found = re.search(r'ERROR:\s*\(([A-Za-z0-9_.-]{1,100})\)', result.stderr)
        code = found.group(1) if found else 'AZURE_READ_REJECTED'
        # Suppress raw CLI output: it may contain application configuration.
        raise InspectionError(code)
    try: return json.loads(result.stdout or 'null')
    except ValueError: raise InspectionError('AZURE_READ_INVALID_JSON') from None


def snapshot(data):
    value = copy.deepcopy(data); properties = value['properties']; template = properties['template']
    template.pop('revisionSuffix', None)
    assert len(template['containers']) == 1, 'CAPTURE_REQUIRES_SINGLE_CONTAINER'
    image = template['containers'][0].pop('image')
    template['containers'][0]['env'] = sorted(template['containers'][0].get('env', []), key=lambda item: item['name'])
    for item in template['containers'][0]['env']:
        if item.get('secretRef') and item.get('value') in (None, ''): item.pop('value', None)
    configuration = properties['configuration']; configuration.get('ingress', {}).pop('traffic', None)
    protected = {'template': template, 'configuration': configuration, 'identity': value.get('identity'),
                 'tags': value.get('tags'), 'location': value.get('location'), 'environmentId': properties.get('environmentId'),
                 'managedEnvironmentId': properties.get('managedEnvironmentId'), 'workloadProfileName': properties.get('workloadProfileName')}
    return {'image': image, 'settingsHash': digest(json.dumps(protected, sort_keys=True)),
            'latest': properties['latestRevisionName'], 'ready': properties.get('latestReadyRevisionName'),
            'mode': configuration['activeRevisionsMode']}


def write_private(name, data):
    path = PRIVATE / name; path.write_text(json.dumps(data)); path.chmod(0o600)


def save(name, data):
    EVIDENCE.mkdir(parents=True, exist_ok=True)
    (EVIDENCE / name).write_text(json.dumps(data, indent=2) + '\n')


def checkpoint_save(data):
    CHECKPOINT.parent.mkdir(parents=True, exist_ok=True)
    CHECKPOINT.write_text(json.dumps(data, indent=2) + '\n')


def utc_now():
    return datetime.now(timezone.utc)


def utc_text(value):
    return value.astimezone(timezone.utc).isoformat().replace('+00:00', 'Z')


def environment(data):
    return {item['name']: item.get('value') for item in data['properties']['template']['containers'][0].get('env', [])}


def capture():
    PRIVATE.mkdir(parents=True, exist_ok=True); PRIVATE.chmod(0o700)
    captured = {}
    for name in ['hidi-api', 'hidi-web']:
        data = azure('containerapp', 'show', '-g', GROUP, '-n', name); state = snapshot(data)
        assert state['mode'] == 'Single' and state['latest'] == state['ready'] and state['ready'], 'CAPTURE_APPLICATION_NOT_STABLE'
        assert re.fullmatch(re.escape('acrhidiprod0927.azurecr.io/' + name) + r'@sha256:[a-f0-9]{64}', state['image']), 'CAPTURE_IMAGE_NOT_IMMUTABLE'
        write_private(name + '.json', data); captured[name] = data
    save('apps-before.json', {name: snapshot(data) for name, data in captured.items()})
    return captured


def unchanged(captured):
    for name, previous in captured.items():
        assert snapshot(azure('containerapp', 'show', '-g', GROUP, '-n', name)) == snapshot(previous), 'APPLICATION_CHANGED_DURING_INSPECTION'


def resource_hashes(data):
    assigned = (data.get('identity') or {}).get('userAssignedIdentities') or {}
    return sorted(digest(key.lower()) for key in assigned)


def inspect_job(captured):
    report = {'readOnly': True, 'jobStarted': False, 'jobUpdated': False, 'runtimePermissionsChanged': False,
              'migrationEffectiveDatabasePermissionsEvaluated': False}
    principal = ''
    try:
        job = azure('containerapp', 'job', 'show', '-g', GROUP, '-n', 'job-hidi-validation')
        write_private('job-hidi-validation.json', job)
        containers = job.get('properties', {}).get('template', {}).get('containers') or []
        config = job.get('properties', {}).get('configuration') or {}
        job_ids = resource_hashes(job); api_ids = resource_hashes(captured['hidi-api'])
        report.update({'available': True, 'containerCount': len(containers), 'identityType': (job.get('identity') or {}).get('type'),
                       'userAssignedIdentityCount': len(job_ids), 'apiSharedIdentityCount': len(set(job_ids) & set(api_ids)),
                       'triggerType': config.get('triggerType')})
        if len(containers) == 1:
            job_env = {item['name']: item.get('value') for item in containers[0].get('env', [])}
            api_env = environment(captured['hidi-api'])
            report['databaseMatchesCapturedApi'] = None if not job_env.get('AZURE_SQL_DATABASE') else job_env['AZURE_SQL_DATABASE'] == api_env.get('AZURE_SQL_DATABASE')
            report['serverMatchesCapturedApi'] = None if not job_env.get('AZURE_SQL_SERVER') else job_env['AZURE_SQL_SERVER'] == api_env.get('AZURE_SQL_SERVER')
        try:
            identity = azure('identity', 'show', '-g', GROUP, '-n', 'id-hidi-migration')
            write_private('id-hidi-migration.json', identity)
            attached = digest(identity['id'].lower()) in job_ids
            report['migrationIdentity'] = {'available': True, 'attachedToJob': attached,
                'clientIdHash': digest(identity['clientId']), 'principalIdHash': digest(identity['principalId'])}
            if attached: principal = identity['principalId']
        except InspectionError as error:
            report['migrationIdentity'] = {'available': False, 'failureCode': str(error)}
    except InspectionError as error:
        report.update({'available': False, 'failureCode': str(error)})
    save('migration-job.json', report)
    return report, principal


def inspect_restore(captured):
    captured_at = utc_now()
    env = environment(captured['hidi-api']); host = env.get('AZURE_SQL_SERVER'); database = env.get('AZURE_SQL_DATABASE')
    assert isinstance(host, str) and re.fullmatch(r'[A-Za-z0-9-]+\.database\.windows\.net', host), 'CAPTURED_SQL_HOST_INVALID'
    assert isinstance(database, str) and database, 'CAPTURED_SQL_DATABASE_MISSING'
    server = host.split('.')[0]
    report = {'readOnly': True, 'restoreStarted': False, 'policyUpdated': False, 'databaseHash': digest(database), 'serverHash': digest(host)}
    api = snapshot(captured['hidi-api'])
    checkpoint = {'passed': False, 'readOnly': True, 'databaseHash': digest(database), 'databaseOnline': False,
                  'pitrRetentionDays': None, 'earliestRestoreDateUtc': None, 'capturedAtUtc': utc_text(captured_at),
                  'apiImage': api['image'], 'apiSettingsHash': api['settingsHash'], 'restoreStarted': False, 'policyUpdated': False}
    try:
        db = azure('sql', 'db', 'show', '-g', GROUP, '-s', server, '-n', database)
        policy = azure('sql', 'db', 'str-policy', 'show', '-g', GROUP, '-s', server, '-n', database)
        write_private('sql-database.json', db); write_private('sql-str-policy.json', policy)
        retention = policy.get('retentionDays'); assert type(retention) is int and 1 <= retention <= 365, 'RESTORE_RETENTION_INVALID'
        earliest = db.get('earliestRestoreDate')
        assert earliest is None or isinstance(earliest, str) and re.fullmatch(r'[0-9T:Z.+-]{10,50}', earliest), 'RESTORE_DATE_INVALID'
        report.update({'available': True, 'status': db.get('status'), 'earliestRestoreDate': earliest,
                       'retentionDays': retention, 'differentialBackupIntervalHours': policy.get('diffBackupIntervalInHours')})
        checkpoint.update({'databaseOnline': db.get('status') == 'Online', 'pitrRetentionDays': retention})
        if earliest:
            parsed = datetime.fromisoformat(earliest.replace('Z', '+00:00'))
            assert parsed.tzinfo is not None, 'RESTORE_DATE_TIMEZONE_MISSING'
            checkpoint['earliestRestoreDateUtc'] = utc_text(parsed)
            checkpoint['passed'] = checkpoint['databaseOnline'] and retention >= 1 and parsed < captured_at
        if not checkpoint['passed']: checkpoint['failureCode'] = 'RESTORE_POINT_NOT_CONFIRMED'
    except InspectionError as error:
        report.update({'available': False, 'failureCode': str(error)})
        checkpoint['failureCode'] = str(error)
    save('restore-retention.json', report)
    checkpoint_save(checkpoint)
    return report, database, checkpoint


def console_command(source, database, principal):
    packed = base64.b64encode(gzip.compress(source.encode(), mtime=0)).decode()
    lines = ['node --input-type=commonjs - ' + shlex.quote(database) + ' ' + shlex.quote(principal) + " <<'HIDI_SKN_ACCESS_NODE'", 'const packed = [']
    lines += [json.dumps(packed[start:start + 1800]) + ',' for start in range(0, len(packed), 1800)]
    lines += ["].join('');", 'const source=require("node:zlib").gunzipSync(Buffer.from(packed,"base64")).toString();',
              'import("data:text/javascript;base64,"+Buffer.from(source).toString("base64")).then(module=>module.run(process.argv[2],process.argv[3])).catch(error=>{const code=/^[A-Z][A-Z0-9_]{0,79}$/.test(String(error?.code))?error.code:"ACCESS_INSPECTION_FAILED";console.log("' + FAILURE_MARKER + '::"+JSON.stringify({failureCode:code}));process.exitCode=1;});',
              'HIDI_SKN_ACCESS_NODE', 'exit']
    assert all(len(line.encode()) < 2000 for line in lines), 'PRIVATE_CONSOLE_LINE_LIMIT'
    return '\n'.join(lines) + '\n'


def terminal_text(value):
    return re.sub(r'\x1b\[[0-?]*[ -/]*[@-~]', '', value)


def marker_report(output, marker):
    for match in re.finditer(re.escape(marker) + r'::(\{[^\r\n]{1,32768}\})\r*\n', terminal_text(output)):
        try:
            report = json.loads(match.group(1))
            if isinstance(report, dict): return report
        except ValueError: pass
    return None


def validate_sql_report(report, database):
    assert report.get('databaseHash') == digest(database), 'SQL_DATABASE_HASH_CHANGED'
    assert report.get('passed') is True and report.get('readOnly') is True, 'SQL_INSPECTION_INCOMPLETE'
    for key in ['ddlExecuted', 'schemaChanged', 'applicationRowsModified', 'applicationRowsReturned']:
        assert report.get(key) is False, 'SQL_READ_ONLY_INVARIANT_FAILED'
    capabilities = report.get('effectiveCapabilities')
    assert isinstance(capabilities, dict) and set(capabilities) == {'createTable', 'createSequence', 'alterDbo', 'controlDatabase', 'viewDefinition'}, 'SQL_CAPABILITIES_INVALID'
    assert all(type(value) is bool or value is None for value in capabilities.values()), 'SQL_CAPABILITIES_INVALID'
    assert report.get('ddlAuthorized') == all(capabilities[key] is True for key in ['createTable', 'createSequence', 'alterDbo']), 'SQL_DDL_FLAG_INVALID'
    assert len(json.dumps(report)) <= 32768, 'SQL_REPORT_SIZE_EXCEEDED'


def inspect_sql(captured, database, principal):
    data = captured['hidi-api']
    command = console_command((HERE / 'access-preflight.mjs').read_text(), database, principal)
    master, slave = pty.openpty()
    process = subprocess.Popen(['az', 'containerapp', 'exec', '-g', GROUP, '-n', 'hidi-api',
        '--revision', data['properties']['latestReadyRevisionName'], '--container', data['properties']['template']['containers'][0]['name'],
        '--command', '/bin/sh', '--only-show-errors'], stdin=slave, stdout=slave, stderr=slave, start_new_session=True)
    os.close(slave); os.set_blocking(master, False); output = b''; pending = b''; sent = False
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
                output += chunk; assert len(output) < 512 * 1024, 'PRIVATE_CONSOLE_OUTPUT_LIMIT'
                plain = terminal_text(output.decode(errors='replace'))
                if not sent and re.search(r'(?:^|[\r\n])[^\r\n]{0,160}[#$] $', plain): pending = command.encode(); sent = True
                if marker_report(plain, MARKER) is not None or marker_report(plain, FAILURE_MARKER) is not None: break
            if process.poll() is not None: break
        plain = terminal_text(output.decode(errors='replace')); report = marker_report(plain, MARKER)
        if report is None:
            code = (marker_report(plain, FAILURE_MARKER) or {}).get('failureCode', 'PRIVATE_CONSOLE_INSPECTION_INCOMPLETE')
            if not isinstance(code, str) or not re.fullmatch(r'[A-Z][A-Z0-9_]{0,79}', code): code = 'PRIVATE_CONSOLE_INSPECTION_INCOMPLETE'
            save('runtime-sql-access.json', {'passed': False, 'readOnly': True, 'ddlExecuted': False, 'schemaChanged': False,
                'applicationRowsModified': False, 'applicationRowsReturned': False, 'consoleCommandSent': sent, 'failureCode': code})
            raise InspectionError(code)
        validate_sql_report(report, database)
        report.update({'privateNetwork': True, 'existingManagedIdentity': True, 'apiImage': snapshot(data)['image'], 'apiSettingsHash': snapshot(data)['settingsHash']})
        save('runtime-sql-access.json', report)
        return report
    finally:
        os.close(master)
        if process.poll() is None:
            process.terminate()
            try: process.wait(timeout=10)
            except subprocess.TimeoutExpired: process.kill(); process.wait(timeout=10)


def main(checkpoint_only=False):
    global PRIVATE
    checkpoint_save({'passed': False, 'readOnly': True, 'failureCode': 'INSPECTION_NOT_COMPLETE', 'capturedAtUtc': utc_text(utc_now())})
    if checkpoint_only:
        if not os.environ.get('HIDI_SKN_ACCESS_PRIVATE_DIR') and not os.environ.get('HIDI_SKN_PRIVATE_DIR'):
            PRIVATE = Path(os.environ.get('RUNNER_TEMP', '/tmp')) / 'hidi-product-skn-private'
        captured = {name: json.loads((PRIVATE / (name + '.json')).read_text()) for name in ['hidi-api', 'hidi-web']}
        for name, data in captured.items():
            state = snapshot(data)
            assert state['mode'] == 'Single' and state['latest'] == state['ready'] and state['ready'], 'CAPTURE_APPLICATION_NOT_STABLE'
            assert re.fullmatch(re.escape('acrhidiprod0927.azurecr.io/' + name) + r'@sha256:[a-f0-9]{64}', state['image']), 'CAPTURE_IMAGE_NOT_IMMUTABLE'
    else: captured = capture()
    unchanged(captured)
    job, principal = inspect_job(captured); restore, database, checkpoint = inspect_restore(captured)
    sql = inspect_sql(captured, database, principal); unchanged(captured)
    result = {'passed': checkpoint['passed'], 'readOnly': True, 'sourceBaseline': BASELINE,
        'sourceSha': os.environ.get('GITHUB_SHA'), 'appsUnchanged': True, 'ddlAuthorized': sql['ddlAuthorized'],
        'restoreMetadataAvailable': bool(restore.get('available')), 'existingMigrationJobVisible': bool(job.get('available')),
        'databaseWrites': False, 'blobWrites': False, 'azureConfigurationWrites': False, 'entraAdministratorChanged': False,
        'firewallChanged': False, 'runtimeGrantsChanged': False, 'historicalPermissionResultsReused': False}
    save('summary.json', result)
    print('Read-only SKN preflight complete; ddlAuthorized=' + str(sql['ddlAuthorized']).lower() + '; live applications unchanged.')
    if not result['passed']: raise InspectionError(checkpoint.get('failureCode', 'RESTORE_METADATA_UNAVAILABLE'))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--checkpoint-only', action='store_true', help='Reuse freshly captured API/web snapshots; repeat guarded read-only SQL, job and PITR checks.')
    args = parser.parse_args()
    try: main(args.checkpoint_only)
    except Exception as error:
        code = str(error) if isinstance(error, (AssertionError, InspectionError)) and re.fullmatch(r'[A-Za-z0-9_.-]{1,100}', str(error)) else 'READ_ONLY_PREFLIGHT_STOPPED'
        save('failure.json', {'passed': False, 'readOnly': True, 'failureCode': code, 'databaseWrites': False,
            'azureConfigurationWrites': False, 'entraAdministratorChanged': False, 'firewallChanged': False, 'runtimeGrantsChanged': False})
        if CHECKPOINT.exists():
            checkpoint = json.loads(CHECKPOINT.read_text())
            if not checkpoint.get('passed'): checkpoint['failureCode'] = code; checkpoint_save(checkpoint)
        print('Read-only SKN preflight stopped: ' + code)
        raise SystemExit(1)
