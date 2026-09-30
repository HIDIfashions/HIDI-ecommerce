#!/usr/bin/env python3
"""Boot the bundled Release app, capture initial evidence, never make financial writes."""
import json, os, pathlib, subprocess, sys, time
OUT = pathlib.Path(os.environ.get('EVIDENCE_DIR', 'evidence/ios-smoke')); OUT.mkdir(parents=True, exist_ok=True)
PKG = 'com.thehidi.app.internal'
def run(*args, check=True, timeout=120):
    p = subprocess.run(list(args), capture_output=True, text=True, timeout=timeout)
    if check and p.returncode: raise RuntimeError(' '.join(args[:4]) + ': ' + p.stderr[-1500:])
    return p.stdout

def sim(*args, **kw): return run('xcrun', 'simctl', *args, **kw)
results = []
try:
    devices = json.loads(sim('list', 'devices', 'available', '-j'))['devices']
    device = next(d for group in devices.values() for d in group if 'iPhone' in d['name'] and d.get('isAvailable'))
    udid = device['udid']; (OUT / 'device.json').write_text(json.dumps(device, indent=2))
    sim('boot', udid, check=False); sim('bootstatus', udid, '-b', timeout=300)
    sim('install', udid, sys.argv[1]); text = sim('launch', udid, PKG); time.sleep(12)
    if PKG not in text: raise AssertionError('simctl did not confirm application launch')
    results.append({'name': 'release-install-and-launch', 'status': 'PASS'})
    for mode in ['light', 'dark']:
        sim('ui', udid, 'appearance', mode); time.sleep(3)
        sim('io', udid, 'screenshot', str(OUT / ('H002-' + mode + '.png')))
    sim('terminate', udid, PKG); sim('launch', udid, PKG); time.sleep(5)
    sim('openurl', udid, 'hidi://collections/all'); time.sleep(6)
    sim('io', udid, 'screenshot', str(OUT / 'collection-deep-link.png'))
    results.append({'name': 'relaunch-and-os-url-handoff', 'status': 'PASS'})
    processes = sim('spawn', udid, 'launchctl', 'list')
    if PKG not in processes: raise AssertionError('App no longer running after navigation')
    results.append({'name': 'process-survives-navigation', 'status': 'PASS'})
    logs = sim('spawn', udid, 'log', 'show', '--last', '3m', '--style', 'compact', '--predicate', 'process == "HIDI"', check=False)
    (OUT / 'runtime.log').write_text(logs)
    if 'No bundle URL present' in logs or 'Unhandled JS Exception' in logs: raise AssertionError('JavaScript startup failure in simulator log')
    results.append({'name': 'bundled-javascript-startup', 'status': 'PASS'})
except Exception as e: results.append({'name': 'smoke-summary', 'status': 'FAIL', 'reason': str(e)[:2000]})
finally: (OUT / 'results.json').write_text(json.dumps({'commit': os.environ.get('TESTED_SHA'), 'platform': 'iOS simulator', 'results': results, 'notClaimed': ['VoiceOver traversal', 'physical device', 'all shopping interactions', '132-screen visual approval']}, indent=2))
if any(x['status'] == 'FAIL' for x in results): sys.exit(1)
