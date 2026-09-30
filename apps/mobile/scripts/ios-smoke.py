#!/usr/bin/env python3
"""Release simulator startup with persistent diagnostics. No financial writes."""
import json, os, pathlib, plistlib, shutil, subprocess, sys, time
OUT = pathlib.Path(os.environ.get('EVIDENCE_DIR', 'evidence/ios-smoke')).resolve(); OUT.mkdir(parents=True, exist_ok=True)
PKG = 'com.thehidi.app.internal'; udid = None; results = []

def run(*args, check=True, timeout=120):
    try:
        p = subprocess.run(list(args), capture_output=True, text=True, timeout=timeout)
    except subprocess.TimeoutExpired as e:
        (OUT / 'command-timeout.txt').write_text(str(args) + '\n' + str(e.stdout) + '\n' + str(e.stderr))
        raise
    if check and p.returncode: raise RuntimeError(' '.join(args[:4]) + ': ' + p.stderr[-1500:])
    return p.stdout

def sim(*args, **kw): return run('xcrun', 'simctl', *args, **kw)
def screenshot(name): return sim('io', udid, 'screenshot', str(OUT / (name + '.png')))
def launch():
    text = sim('launch', '--terminate-running-process', udid, PKG, timeout=300)
    if PKG not in text: raise AssertionError('simctl did not confirm application launch: ' + text)
    time.sleep(10)
    processes = sim('spawn', udid, 'launchctl', 'list')
    if PKG not in processes: raise AssertionError('App stopped after launch')
    return text

try:
    app = pathlib.Path(sys.argv[1]).resolve()
    info = plistlib.loads((app / 'Info.plist').read_bytes())
    if info.get('CFBundleIdentifier') != PKG: raise AssertionError('Built simulator identity does not match internal app')
    if not (app / 'main.jsbundle').is_file(): raise AssertionError('Release JavaScript bundle is missing')
    devices = json.loads(sim('list', 'devices', 'available', '-j'))['devices']
    choices = [(runtime, d) for runtime, group in devices.items() for d in group if 'iPhone' in d['name'] and d.get('isAvailable')]
    if not choices: raise AssertionError('No iPhone simulator available on runner')
    # Prefer an already booted device. Otherwise use the newest available runtime.
    runtime, device = sorted(choices, key=lambda x: (x[1].get('state') == 'Booted', x[0]), reverse=True)[0]
    udid = device['udid']; (OUT / 'device.json').write_text(json.dumps({'runtime': runtime, **device}, indent=2))
    run('open', '-a', 'Simulator', '--args', '-CurrentDeviceUDID', udid, check=False)
    sim('boot', udid, check=False)
    (OUT / 'boot-status.log').write_text(sim('bootstatus', udid, '-b', timeout=660))
    # First-boot service migration can continue just after the device changes to Booted.
    time.sleep(12)
    sim('install', udid, str(app), timeout=180)
    (OUT / 'launch.log').write_text(launch())
    results.append({'name': 'release-install-and-launch', 'status': 'PASS'})
    for mode in ['light', 'dark']:
        sim('ui', udid, 'appearance', mode); time.sleep(3); screenshot('H002-' + mode)
    sim('terminate', udid, PKG); (OUT / 'relaunch.log').write_text(launch())
    sim('openurl', udid, 'hidi://collections/all'); time.sleep(6); screenshot('collection-deep-link')
    results.append({'name': 'relaunch-and-os-url-handoff', 'status': 'PASS'})
    if PKG not in sim('spawn', udid, 'launchctl', 'list'): raise AssertionError('App stopped after URL handoff')
    results.append({'name': 'process-survives-navigation', 'status': 'PASS'})
    results.append({'name': 'embedded-release-bundle-present', 'status': 'PASS'})
except Exception as e:
    results.append({'name': 'smoke-summary', 'status': 'FAIL', 'reason': str(e)[:2000]})
finally:
    if udid:
        for name, args in [('processes', ('spawn', udid, 'launchctl', 'list')), ('runtime', ('spawn', udid, 'log', 'show', '--last', '8m', '--style', 'compact', '--predicate', 'process == "HIDI" OR eventMessage CONTAINS "com.thehidi.app.internal"'))]:
            try: (OUT / (name + '.log')).write_text(sim(*args, check=False, timeout=90))
            except Exception as e: (OUT / (name + '-diagnostic-error.txt')).write_text(str(e))
        try: screenshot('final-state')
        except Exception: pass
        crashdir = pathlib.Path.home() / 'Library/Logs/DiagnosticReports'
        for crash in crashdir.glob('HIDI*'):
            if crash.is_file(): shutil.copy2(crash, OUT / crash.name)
        logpath = OUT / 'runtime.log'
        if logpath.exists():
            text = logpath.read_text()
            if 'No bundle URL present' in text or 'Unhandled JS Exception' in text:
                results.append({'name': 'javascript-runtime', 'status': 'FAIL', 'reason': 'JavaScript startup failure in simulator log'})
    (OUT / 'results.json').write_text(json.dumps({'commit': os.environ.get('TESTED_SHA'), 'platform': 'iOS simulator', 'results': results, 'notClaimed': ['VoiceOver traversal', 'physical device', 'all shopping interactions', '132-screen visual approval']}, indent=2))
if any(x['status'] == 'FAIL' for x in results): sys.exit(1)
