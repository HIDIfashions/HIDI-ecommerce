import copy
import hashlib
import json
import tempfile
import unittest
from pathlib import Path
from css_proof import SOURCES, MAIN, REQUIRED, verify_complete_css


class CompleteCssGateTests(unittest.TestCase):
    def fixture(self, folder):
        source = {'allSourceCssPreserved': True, 'styles': {path: {'sha256': sha, 'originalBytes': 100} for path, sha in SOURCES.items()}}
        content = json.dumps(source).encode()
        (folder / 'critical-css-quality.json').write_bytes(content)
        rows = []
        for group, label, phase in sorted(REQUIRED):
            desktop = not (group == 'initial' and label in ('chromium/320', 'chromium/390'))
            inline = [{'source': path, 'sha256': sha, 'claimedHash': sha, 'bytes': 100, 'applied': True, 'rules': 1, 'appliedAt': 1} for path, sha in SOURCES.items() if desktop and path != MAIN]
            external = [{'source': path, 'url': path, 'fullUrl': path, 'applied': phase == 'applied', 'sheet': phase == 'applied', 'media': 'all' if phase == 'applied' else 'print', 'responseEnd': 2 if phase == 'applied' else 0} for path in SOURCES if not desktop or path == MAIN]
            rows.append({'group': group, 'label': label, 'phase': phase, 'desktopDelivery': desktop, 'requestProfile': {'userAgent': 'Desktop browser' if desktop else 'Android Mobile browser', 'mobileHint': '?0' if desktop else '?1'}, 'sourceOrder': list(SOURCES), 'inline': inline, 'external': external, 'cssRequests': [sheet['url'] for sheet in external], 'mediaStart': 3 if group == 'video' else None})
        return {'passed': True, 'sourceProofSha256': hashlib.sha256(content).hexdigest(), 'sources': SOURCES.copy(), 'initialCases': 8, 'recoveryCases': 32, 'desktopVideoCases': 3, 'results': rows}

    def test_exact_complete_evidence_is_accepted(self):
        with tempfile.TemporaryDirectory() as name:
            folder = Path(name)
            (folder / 'complete-css-candidate.json').write_text(json.dumps(self.fixture(folder)))
            verify_complete_css(folder)

    def test_missing_duplicate_stale_or_vacuous_evidence_is_rejected(self):
        with tempfile.TemporaryDirectory() as name:
            folder = Path(name)
            original = self.fixture(folder)
            for scenario in ('missing', 'duplicate', 'source-hash', 'capture-hash', 'empty-external', 'changed-inline', 'wrong-order', 'video-too-early', 'false-pending', 'missing-request', 'duplicate-inline-download', 'infinite-time', 'wrong-profile'):
                with self.subTest(scenario=scenario):
                    proof = copy.deepcopy(original)
                    applied = next(row for row in proof['results'] if row['group'] == 'video')
                    pending = next(row for row in proof['results'] if row['phase'] == 'pending')
                    if scenario == 'missing': proof['results'].pop()
                    if scenario == 'duplicate': proof['results'][-1] = copy.deepcopy(proof['results'][0])
                    if scenario == 'source-hash': proof['sources'][MAIN] = '0' * 64
                    if scenario == 'capture-hash': proof['sourceProofSha256'] = '0' * 64
                    if scenario == 'empty-external': applied['external'] = []
                    if scenario == 'changed-inline': applied['inline'][0]['sha256'] = '0' * 64
                    if scenario == 'wrong-order': applied['sourceOrder'].reverse()
                    if scenario == 'video-too-early': applied['mediaStart'] = 0.5
                    if scenario == 'false-pending': pending['external'][0]['applied'] = True
                    if scenario == 'missing-request': applied['cssRequests'] = []
                    if scenario == 'duplicate-inline-download': applied['cssRequests'].append(applied['inline'][0]['source'])
                    if scenario == 'infinite-time': applied['mediaStart'] = float('inf')
                    if scenario == 'wrong-profile': applied['requestProfile']['mobileHint'] = '?1'
                    (folder / 'complete-css-candidate.json').write_text(json.dumps(proof))
                    with self.assertRaises(AssertionError): verify_complete_css(folder)
