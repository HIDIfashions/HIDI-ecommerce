"""Inspect and repair the existing product-photo upload environment without rebuilding."""
import argparse
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
PRIVATE = Path(os.environ.get('RUNNER_TEMP', '/tmp')) / 'hidi-media-upload-private'
EVIDENCE = Path('evidence/media-upload-config')
MARKER = 'HIDI_MEDIA_CHECK'


def load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


cloud = load('media_config_cloud', HERE.parent / 'privacy-policy/rollout.py')
console = load('media_config_console', HERE.parent / 'product-skn/schema-check.py')


def save(name, value):
    EVIDENCE.mkdir(parents=True, exist_ok=True)
    (EVIDENCE / name).write_text(json.dumps(value, indent=2) + '\n')


def env(data):
    return {item['name']: item for item in data['properties']['template']['containers'][0].get('env', [])}


def capture():
    PRIVATE.mkdir(parents=True, exist_ok=True)
    PRIVATE.chmod(0o700)
    captured = {}
    for name in ('hidi-web', 'hidi-api'):
        data = cloud.app(name)
        state = cloud.snapshot(data)
        cloud.ready(state)
        assert re.fullmatch(r'acrhidiprod0927\.azurecr\.io/' + name + r'@sha256:[a-f0-9]{64}', state['image']), 'Immutable active image required'
        path = PRIVATE / (name + '.json')
        path.write_text(json.dumps(data))
        path.chmod(0o600)
        captured[name] = data
    save('before.json', {name: cloud.snapshot(data) for name, data in captured.items()})
    return captured


def unchanged(captured):
    for name, data in captured.items():
        assert cloud.snapshot(cloud.app(name)) == cloud.snapshot(data), 'Concurrent application change: ' + name


def runtime_probe(data, payload=None):
    account = env(data).get('AZURE_STORAGE_ACCOUNT', {}).get('value', '')
    assert re.fullmatch(r'[a-z0-9]{3,24}', account), 'Captured storage account must be explicit and valid'
    command = console.console_command((HERE / 'probe.mjs').read_text(), account, 'run', payload).replace('HIDI_SKN_SCHEMA', MARKER)
    master, slave = pty.openpty()
    process = subprocess.Popen(['az', 'containerapp', 'exec', '-g', cloud.GROUP, '-n', 'hidi-web',
        '--revision', data['properties']['latestReadyRevisionName'],
        '--container', data['properties']['template']['containers'][0]['name'],
        '--command', '/bin/sh', '--only-show-errors'],
        stdin=slave, stdout=slave, stderr=slave, start_new_session=True)
    os.close(slave)
    os.set_blocking(master, False)
    output, pending, sent = b'', b'', False
    try:
        deadline = time.monotonic() + 150
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
                assert len(output) < 512 * 1024, 'Private console output limit'
                plain = console.terminal_text(output.decode(errors='replace'))
                if not sent and re.search(r'(?:^|[\r\n])[^\r\n]{0,160}[#$] $', plain):
                    pending, sent = command.encode(), True
                if console.complete_marker(plain, MARKER) or console.complete_marker(plain, MARKER + '_FAILED'): break
            if process.poll() is not None: break
        plain = console.terminal_text(output.decode(errors='replace'))
        report = console.complete_marker(plain, MARKER)
        if not report:
            code = (console.complete_marker(plain, MARKER + '_FAILED') or {}).get('failureCode', 'PRIVATE_MEDIA_CHECK_INCOMPLETE')
            assert isinstance(code, str) and re.fullmatch(r'[A-Z][A-Z0-9_]{0,79}', code), 'Invalid bounded failure code'
            raise AssertionError(code)
        assert report.get('passed') is True and report.get('readOnly') is True and report.get('blobWrites') is False and report.get('databaseWrites') is False, 'Read-only probe scope differs'
        return report
    finally:
        os.close(master)
        if process.poll() is None:
            process.terminate()
            try: process.wait(timeout=10)
            except subprocess.TimeoutExpired: process.kill(); process.wait(timeout=10)


def inspect():
    captured = capture()
    report = runtime_probe(captured['hidi-web'])
    unchanged(captured)
    report['liveApplicationsUnchanged'] = True
    save('runtime-inspection.json', report)
    print(json.dumps(report))


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('action', choices=['inspect'])
    args = parser.parse_args()
    try: globals()[args.action]()
    except Exception as error:
        print(str(error) if isinstance(error, AssertionError) else 'MEDIA_CONFIGURATION_OPERATION_FAILED')
        raise SystemExit(1)
