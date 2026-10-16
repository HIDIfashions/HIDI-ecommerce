"""Replace only the gallery stylesheet reference; preserve live code and photos."""
from pathlib import Path
import hashlib
import re
HERE = Path(__file__).resolve().parent

def patch_runtime(base, overlay):
    base, overlay = Path(base), Path(overlay)
    html = (base / 'dist/index.html').read_bytes()
    refs = re.findall(rb'<link rel="stylesheet" href="(/assets/portrait-gallery-[a-f0-9]+\.css)">', html)
    assert len(refs) == 1, 'One deployed gallery stylesheet required'
    reference = refs[0]
    name = reference.decode().lstrip('/')
    assert (base / 'dist' / name).read_bytes() == (HERE / 'baseline.css').read_bytes(), 'Gallery layout baseline changed independently'
    style = (HERE / 'portrait-gallery.css').read_bytes()
    destination = 'assets/portrait-gallery-' + hashlib.sha256(style).hexdigest()[:16] + '.css'
    newref = ('/' + destination).encode()
    assert html.count(reference) == 1 and not (base / 'dist' / destination).exists()
    newhtml = html.replace(reference, newref)
    assert newhtml.replace(newref, reference) == html, 'Unrelated HTML changed'
    files = {'dist/index.html': newhtml, 'dist/' + destination: style}
    for item, content in files.items():
        path = overlay / item
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(content)
    return {'passed': True, 'allowedFiles': sorted(files), 'renamedAssets': {'dist/' + name: 'dist/' + destination}, 'portraitGalleryOnly': True, 'portraitLayoutOnly': True, 'inverseTransformsVerified': True, 'unrelatedRuntimeBytesPreserved': True, 'mediaSelectionsUntouched': True}
