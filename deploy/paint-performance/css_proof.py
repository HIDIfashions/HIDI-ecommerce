"""Fail closed unless complete CSS has independent, exhaustive browser evidence."""
import hashlib
import json
import math
import re
from urllib.parse import urlsplit

SOURCES = {
    '/assets/index-yOknTVcM.css': '642ee7cd71456af76aac15c566be39e3360631ce8bd90cbae28faab489b3dac2',
    '/homepage-responsive-1295060fc1cb9b23.css': '1295060fc1cb9b235832a56c63145ebd252fff805e2ea24fdf3052f363dfab06',
    '/assets/next-chapter-8d081c31115549c7.css': '8d081c31115549c75d054c347a7088277270df31b954df402e63b3900061e3e9',
    '/assets/care-break-3de9d6e53702a218.css': '3de9d6e53702a2180f89a412aaf818984c87e7f50661af818e5e908085095223',
    '/assets/portrait-gallery-e0d043c3470dafd4.css': 'e0d043c3470dafd4569435f117d8f1fb40d60d081600c5531f556adc11970907',
    '/storefront-refinements-60be634c50eba5f7.css': '60be634c50eba5f7bd44c8712fb991cef318444edd2383c635aa6940a3943003',
    '/compact-header-526cb1c7fc69a7a3.css': '526cb1c7fc69a7a390e2ae82abff6b44fc9839856d34d4fcac46b9f8daebb9ba',
    '/pricing-assets/styles.css': 'c99b2a3ecd4e050ff4c34f36b7776936c053955c32f34ee7b48c426b7c236fcd',
}
MAIN = next(iter(SOURCES))
INITIAL = {f'{engine}/{width}' for engine in ('chromium', 'webkit') for width in (320, 390, 768, 1440)}
RECOVERY = {f'{engine}/{width}/{case}' for engine in ('chromium', 'webkit') for width in (390, 1440)
            for case in ('offline', 'late-main', 'media-offline', 'tampered-main', 'slow-document', 'origin-media-offline', 'tampered-style', 'edge-offline')}
VIDEO = {'Desktop full-css-held', 'Desktop reduced-motion', 'Desktop data-saving'}
REQUIRED = ({('initial', label, phase) for label in INITIAL for phase in ('pending', 'applied')}
            | {('recovery', label, 'applied') for label in RECOVERY}
            | {('video', label, 'applied') for label in VIDEO}
            | {('video-held', 'Desktop full-css-held', 'pending')})
OPTIONAL = {('video', f'Chromium {width}', 'applied') for width in (768, 1440)}


def verify_complete_css(out):
    source_bytes = (out / 'critical-css-quality.json').read_bytes()
    captured = json.loads(source_bytes)
    proof = json.loads((out / 'complete-css-candidate.json').read_text())
    assert proof['passed'] and captured['allSourceCssPreserved']
    assert proof['sourceProofSha256'] == hashlib.sha256(source_bytes).hexdigest(), 'CSS proof must bind to this capture'
    assert proof['sources'] == SOURCES == {path: row['sha256'] for path, row in captured['styles'].items()}
    assert (proof['initialCases'], proof['recoveryCases'], proof['desktopVideoCases']) == (8, 32, 3)
    rows = proof['results']
    keys = [(row['group'], row['label'], row['phase']) for row in rows]
    assert len(keys) == len(set(keys)) and REQUIRED <= set(keys) <= REQUIRED | OPTIONAL, 'Missing or duplicated CSS browser coverage'
    for row in rows:
        desktop = not (row['group'] == 'initial' and row['label'] in ('chromium/320', 'chromium/390'))
        assert row['desktopDelivery'] is desktop
        profile = row['requestProfile']
        selected = bool(profile['userAgent']) and not re.search('Mobile|Android', profile['userAgent'], re.I) and profile['mobileHint'] != '?1'
        assert selected is desktop
        assert row['sourceOrder'] == list(captured['styles']) == list(SOURCES), 'Original CSS cascade order must match'
        inline, external = row['inline'], row['external']
        expected_inline = set(SOURCES) - {MAIN} if desktop else set()
        assert len(inline) == len(expected_inline) and {sheet['source'] for sheet in inline} == expected_inline
        assert len(external) == (1 if desktop else 8) and {sheet['source'] for sheet in external} == set(SOURCES) - expected_inline
        for sheet in inline:
            assert sheet['sha256'] == sheet['claimedHash'] == SOURCES[sheet['source']]
            assert sheet['bytes'] == captured['styles'][sheet['source']]['originalBytes']
            assert sheet['applied'] and sheet['rules'] > 0 and math.isfinite(sheet['appliedAt']) and sheet['appliedAt'] > 0
            forbidden = {sheet['source'], '/assets/style-' + SOURCES[sheet['source']][:16] + '.css'}
            assert not any(urlsplit(url).path in forbidden for url in row['cssRequests']), 'Inline CSS must not also be fetched'
            if row['mediaStart'] is not None:
                assert 0 < sheet['appliedAt'] <= row['mediaStart']
        for sheet in external:
            assert sheet['url'] in row['cssRequests'] or sheet['fullUrl'] in row['cssRequests']
            if row['phase'] == 'pending':
                assert not sheet['applied'] and not sheet['sheet'] and sheet['media'] != 'all' and sheet['responseEnd'] in (None, 0)
            else:
                assert sheet['applied'] and sheet['sheet'] and sheet['media'] == 'all' and math.isfinite(sheet['responseEnd']) and sheet['responseEnd'] > 0
                if row['mediaStart'] is not None:
                    assert sheet['responseEnd'] <= row['mediaStart']
        if row['group'] == 'video':
            assert row['mediaStart'] is not None and math.isfinite(row['mediaStart']) and row['mediaStart'] > 0
        else:
            assert row['mediaStart'] is None


if __name__ == '__main__':
    import sys
    from pathlib import Path
    verify_complete_css(Path(sys.argv[1]))
    print('PASS exact complete CSS browser evidence')
