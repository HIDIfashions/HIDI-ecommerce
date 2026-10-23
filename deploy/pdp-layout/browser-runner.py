"""Run read-only browser regression in a version-matched browser image."""
import json
import os
from pathlib import Path
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[2]
EVIDENCE = ROOT / 'evidence/pdp-layout'
BROWSER_IMAGE = 'mcr.microsoft.com/playwright:v1.56.1-noble'
CSS_SHA = '0d97628e83dfedadc34cbee8d55ee96842bb9fda062890456cfe748664cdbd77'

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
    for engine in ['chromium', 'firefox', 'webkit']:
        assert len([r for r in layout['results'] if r['engine'] == engine and r['passed']]) == 12
        assert len([r for r in commerce['results'] if r['engine'] == engine and r['passed']]) == 2
    return {'passed': True, 'actualRuntime': True, 'cssSha256': CSS_SHA,
            'engines': ['chromium', 'firefox', 'webkit'], 'layoutCases': 36,
            'commerceCases': 6, 'liveWrites': 0}

def run(stage, base):
    assert stage in ['candidate', 'live']
    (EVIDENCE / stage).mkdir(parents=True, exist_ok=True)
    for script in ['verify.mjs', 'commerce.mjs']:
        subprocess.run(['docker', 'run', '--rm', '--network', 'host', '--ipc=host',
            '-v', str(ROOT) + ':/work:ro', '-v', str(EVIDENCE) + ':/evidence',
            '-v', os.environ['HIDI_BROWSER_PACKAGE'] + ':/browser:ro', '-w', '/work',
            '-e', 'HIDI_PLAYWRIGHT_MODULE=/browser/node_modules/playwright/index.mjs',
            '-e', 'HIDI_RUNTIME_BASE=' + base, '-e', 'HIDI_TEST_OUTPUT=/evidence/' + stage,
            '-e', 'HIDI_MEDIA_READONLY_ORIGIN=' + ('https://hidiindia.com' if stage == 'candidate' else ''),
            BROWSER_IMAGE, 'node', 'deploy/pdp-layout/' + script], check=True, timeout=900)
    (EVIDENCE / stage / 'summary.json').write_text(json.dumps(verify_reports(stage), indent=2))

if __name__ == '__main__':
    run(sys.argv[1], sys.argv[2])
