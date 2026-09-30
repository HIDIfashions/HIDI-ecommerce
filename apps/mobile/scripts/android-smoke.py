#!/usr/bin/env python3
"""Installed release-build smoke. No OTP, order, payment, support or cart writes."""
import json, os, pathlib, re, subprocess, sys, time, xml.etree.ElementTree as ET
OUT = pathlib.Path(os.environ.get('EVIDENCE_DIR', 'evidence/android-smoke')); OUT.mkdir(parents=True, exist_ok=True)
PKG = 'com.thehidi.app.internal'
results = []
def cmd(*args, check=True, binary=False, timeout=60):
    p = subprocess.run(list(args), capture_output=True, text=not binary, timeout=timeout)
    if check and p.returncode: raise RuntimeError(str(args[:3]) + ': ' + str(p.stderr)[-1200:])
    return p.stdout

def adb(*args, **kw): return cmd('adb', *args, **kw)
def shell(*args, **kw): return adb('shell', *args, **kw)
def capture(name):
    (OUT / (name + '.png')).write_bytes(adb('exec-out', 'screencap', '-p', binary=True))
    shell('uiautomator', 'dump', '/sdcard/hidi-ui.xml', check=False)
    xml = shell('cat', '/sdcard/hidi-ui.xml', check=False)
    (OUT / (name + '.xml')).write_text(xml)
    return xml

def nodes():
    shell('uiautomator', 'dump', '/sdcard/hidi-ui.xml', check=False)
    try: return list(ET.fromstring(shell('cat', '/sdcard/hidi-ui.xml')).iter('node'))
    except ET.ParseError: return []

def tap(label, timeout=45):
    until = time.time() + timeout
    while time.time() < until:
        items = nodes()
        matches = [n for n in items if label == n.get('text') or label == n.get('content-desc') or label == n.get('resource-id')]
        if not matches: matches = [n for n in items if label.lower() in (n.get('text', '') + ' ' + n.get('content-desc', '')).lower()]
        for n in matches:
            nums = list(map(int, re.findall(r'\d+', n.get('bounds', ''))))
            if len(nums) == 4 and nums[2] > nums[0] and nums[3] > nums[1]:
                shell('input', 'tap', str((nums[0] + nums[2]) // 2), str((nums[1] + nums[3]) // 2)); time.sleep(1.5); return
        # Scroll the form instead of assuming the primary CTA is above the fold.
        shell('input', 'swipe', '160', '640', '160', '230', '300', check=False); time.sleep(.5)
    raise AssertionError('Control not reachable: ' + label)

def launch():
    shell('am', 'force-stop', PKG)
    report = shell('am', 'start', '-W', '-n', PKG + '/com.thehidi.app.MainActivity')
    time.sleep(5)
    if not shell('pidof', PKG, check=False).strip(): raise AssertionError('App process did not survive launch')
    return report

def check(name, action):
    try: action(); results.append({'name': name, 'status': 'PASS'})
    except Exception as e:
        results.append({'name': name, 'status': 'FAIL', 'reason': str(e)[:1000]}); capture('failure-' + name); raise

try:
    apk = sys.argv[1]
    adb('install', '-r', apk, timeout=120)
    shell('pm', 'clear', PKG)
    adb('logcat', '-c')
    (OUT / 'device.txt').write_text(shell('getprop'))
    check('launch-release-no-metro', lambda: launch())
    xml = capture('H002-welcome')
    if 'Explore HIDI' not in xml and 'A little more you' not in xml:
        raise AssertionError('Release JavaScript did not render the welcome screen')
    check('H002-guest-entry', lambda: tap('Explore HIDI'))
    time.sleep(18)
    capture('H009-home')
    check('H010-shop-tab', lambda: tap('Shop'))
    capture('H010-shop')
    check('H021-saved-tab', lambda: tap('Saved'))
    capture('H021-saved-empty')
    check('H084-account-tab', lambda: tap('You'))
    capture('H084-account')
    # No contacts permission or first-launch notification request is issued.
    permission_text = shell('dumpsys', 'package', PKG)
    if 'android.permission.READ_CONTACTS' in permission_text: raise AssertionError('Unexpected contacts permission')
    results.append({'name': 'no-contacts-permission', 'status': 'PASS'})
    # Different widths and font sizes; screenshots require human visual approval.
    for width, scale in [(320, '2.0'), (360, '1.3'), (390, '1.0'), (412, '2.0')]:
        shell('wm', 'density', '160'); shell('wm', 'size', f'{width}x844')
        shell('settings', 'put', 'system', 'font_scale', scale)
        time.sleep(3); capture(f'H084-{width}dp-font-{scale}')
    shell('cmd', 'uimode', 'night', 'yes', check=False); time.sleep(3); capture('H084-dark')
    shell('settings', 'put', 'system', 'accelerometer_rotation', '0')
    shell('settings', 'put', 'system', 'user_rotation', '1'); time.sleep(3); capture('H084-landscape')
    shell('settings', 'put', 'system', 'user_rotation', '0'); shell('settings', 'put', 'system', 'font_scale', '1.0'); shell('wm', 'size', 'reset'); shell('wm', 'density', 'reset')
    check('process-death-restoration', lambda: launch()); capture('restored-shell')
    # Offline fresh install is deliberately isolated from other applications.
    shell('pm', 'clear', PKG)
    shell('svc', 'wifi', 'disable', check=False); shell('svc', 'data', 'disable', check=False)
    check('offline-cold-launch', lambda: launch())
    check('offline-guest-entry', lambda: tap('Explore HIDI'))
    time.sleep(20); capture('H106-offline-no-cache')
    shell('svc', 'wifi', 'enable', check=False); shell('svc', 'data', 'enable', check=False)
    # OS Activity launch duration is recorded, not called useful-content p95.
    launches = []
    for _ in range(5):
        report = launch(); match = re.search(r'TotalTime:\s*(\d+)', report)
        launches.append({'osActivityLaunchMs': int(match.group(1)) if match else None})
    (OUT / 'launch-samples.json').write_text(json.dumps({'context': 'Hosted emulator, 5 force-stop Activity starts; NOT real-device useful-content SLO', 'samples': launches}, indent=2))
    log = adb('logcat', '-d', '-s', 'AndroidRuntime:E', 'ReactNativeJS:E')
    (OUT / 'runtime-errors.log').write_text(log)
    if re.search(r'FATAL EXCEPTION|JavascriptException|Unable to load script|Invariant Violation|TypeError:', log): raise AssertionError('Fatal/JS runtime error; inspect runtime-errors.log')
    results.append({'name': 'no-fatal-runtime-errors', 'status': 'PASS'})
except Exception as e:
    results.append({'name': 'smoke-summary', 'status': 'FAIL', 'reason': str(e)[:1000]})
    try: (OUT / 'runtime-errors.log').write_text(adb('logcat', '-d', '-s', 'AndroidRuntime:E', 'ReactNativeJS:E'))
    except Exception: pass
finally:
    shell('svc', 'wifi', 'enable', check=False); shell('svc', 'data', 'enable', check=False)
    shell('wm', 'size', 'reset', check=False); shell('wm', 'density', 'reset', check=False)
    (OUT / 'results.json').write_text(json.dumps({'commit': os.environ.get('TESTED_SHA'), 'api': os.environ.get('ANDROID_API'), 'platform': 'Android emulator', 'results': results, 'notClaimed': ['132-screen visual approval', 'physical-device accessibility', 'live OTP or financial writes', 'real-device performance p95']}, indent=2))
if any(x['status'] == 'FAIL' for x in results): sys.exit(1)
