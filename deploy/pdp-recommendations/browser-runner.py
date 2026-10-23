"""Run read-only browser regression in a version-matched browser image."""
import json
import os
from pathlib import Path
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[2]
EVIDENCE = ROOT / 'evidence/pdp-recommendations'
BROWSER_IMAGE = 'mcr.microsoft.com/playwright:v1.56.1-noble'
CSS_SHA = 'e9cf9da43c506e03b623d0ff1d1d56dad0b34034101053a838d338fd62c3d7d5'

def verify_reports(stage):
    folder = EVIDENCE / stage
    layout = json.loads((folder / 'report.json').read_text())
    commerce = json.loads((folder / 'commerce-report.json').read_text())
    assert layout['passed'] and commerce['passed']
    assert layout['actualRuntime'] and commerce['actualRuntime']
    assert layout['publicMediaFixture'] == commerce['publicMediaFixture'] == (stage == 'candidate')
    assert layout['cssSha256'] == CSS_SHA
    assert layout['upstreamWrites'] == commerce['upstreamWrites'] == 0
    assert len(layout['results']) == 36 and len(layout['interactions']) == 6
    assert len(commerce['results']) == 6
    assert all(r['hydratedPurchaseControls'] and r['pointerAndKeyboardSizeSelection'] for r in commerce['results'])
    assert all(r['pairedHeaderState'] and r['reloaded'] for r in layout['results'])
    assert all(len(r['tabletStates']) == 2 for r in layout['results'] if 761 <= r['width'] <= 1000)
    for engine in ['chromium', 'firefox', 'webkit']:
        assert len([r for r in layout['results'] if r['engine'] == engine and r['passed']]) == 12
        assert len([r for r in commerce['results'] if r['engine'] == engine and r['passed']]) == 2
    catalogue=json.loads((folder/'catalogue-report.json').read_text())
    assert catalogue['passed'] and len(catalogue['results'])==catalogue['productCount']*2
    if stage=='live':
        cart=json.loads((folder/'real-cart-report.json').read_text());assert cart['passed'] and len(cart['results'])==6 and all(r['testItemsRemoved'] for r in cart['results'])
    return {'passed': True, 'actualRuntime': True, 'cssSha256': CSS_SHA,
            'engines': ['chromium', 'firefox', 'webkit'], 'layoutCases': 36,
            'commerceCases': 6, 'readOnlyRegressionUpstreamWrites': 0, 'realCartAdds': 6 if stage == 'live' else 0, 'realCartRemovals': 6 if stage == 'live' else 0, 'ordersCreated': 0}

def run(stage, base):
    assert stage in ['candidate', 'live']
    (EVIDENCE / stage).mkdir(parents=True, exist_ok=True)
    scripts=(['real-cart.mjs'] if stage=='live' else [])+['verify.mjs','commerce.mjs','catalogue.mjs']
    for script in scripts:
        subprocess.run(['docker', 'run', '--rm', '--network', 'host', '--ipc=host',
            '-v', str(ROOT) + ':/work:ro', '-v', str(EVIDENCE) + ':/evidence',
            '-v', os.environ['HIDI_BROWSER_PACKAGE'] + ':/browser:ro', '-w', '/work',
            '-e', 'HIDI_PLAYWRIGHT_MODULE=/browser/node_modules/playwright/index.mjs',
            '-e', 'HIDI_RUNTIME_BASE=' + base, '-e', 'HIDI_TEST_OUTPUT=/evidence/' + stage,
            '-e', 'HIDI_MEDIA_READONLY_ORIGIN=' + ('https://hidiindia.com' if stage == 'candidate' else ''),
            BROWSER_IMAGE, 'node', 'deploy/pdp-recommendations/' + script], check=True, timeout=900)
    (EVIDENCE / stage / 'summary.json').write_text(json.dumps(verify_reports(stage), indent=2))

if __name__ == '__main__':
    run(sys.argv[1], sys.argv[2])
