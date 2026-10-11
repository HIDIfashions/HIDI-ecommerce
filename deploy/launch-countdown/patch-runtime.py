"""Inject two isolated homepage assets into the fresh retained image."""
from pathlib import Path

HERE = Path(__file__).resolve().parent
ASSETS = {
    'hidi-launch-countdown-20261011.js': 'countdown.js',
    'hidi-launch-countdown-20261011.css': 'countdown.css',
}
INJECTION = '\n<link rel="stylesheet" href="/hidi-launch-countdown-20261011.css">\n<script defer src="/hidi-launch-countdown-20261011.js"></script>\n'

def patch_runtime(base, overlay):
    base, overlay = Path(base), Path(overlay)
    original = (base/'dist/index.html').read_text()
    assert original.count('</head>') == 1, 'Exact homepage head required'
    assert 'hidi-launch-countdown-20261011' not in original, 'Countdown already installed'
    updated = original.replace('</head>', INJECTION+'</head>')
    assert updated.replace(INJECTION, '', 1) == original, 'Unrelated homepage bytes changed'
    files = {'dist/index.html': updated}
    for name, source in ASSETS.items():
        assert not (base/'dist'/name).exists(), 'Countdown asset path already occupied'
        files['dist/'+name] = (HERE/source).read_text()
    for name, text in files.items():
        destination = overlay/name
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_text(text)
    return {'passed': True, 'allowedFiles': sorted(files), 'inverseTransformsVerified': True,
            'launchAt': '2026-10-11T19:01:00+05:30', 'databaseWrites': False, 'blobWrites': False}
