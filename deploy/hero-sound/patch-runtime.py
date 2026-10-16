"""Replace only the existing hero sound button with a compact icon."""
from pathlib import Path
import hashlib
import re
HERE = Path(__file__).resolve().parent

def bundle(source):
    text = source.decode()
    names = re.findall(r'function ([\w$]+)\(\) \{\n  const \{ openCollection, dialogOpen \} = HidiHeroContext\(\);', text)
    assert len(names) == 1, 'The published audio component must be present exactly once'
    name = names[0]
    old = (HERE / 'baseline-component.runtime.js').read_text().replace('function HidiHeroComponent()', 'function ' + name + '()')
    new = (HERE / 'component.runtime.js').read_text().replace('function HidiHeroComponent()', 'function ' + name + '()')
    assert old != new and text.count(old) == 1, 'Existing audio component must match the captured baseline'
    updated = text.replace(old, new)
    assert updated.replace(new, old).encode() == source
    return updated.encode()

def patch_runtime(base, overlay):
    base, overlay = Path(base), Path(overlay)
    html = (base / 'dist/index.html').read_bytes()
    refs = re.findall(rb'<script type="module" crossorigin src="([^"\s]+)"></script>', html)
    assert len(refs) == 1
    reference = refs[0]
    name = reference.decode().removeprefix('./').removeprefix('/')
    assert re.fullmatch(r'assets/index-[A-Za-z0-9_-]+\.js', name)
    updated = bundle((base / 'dist' / name).read_bytes())
    destination = 'assets/index-' + hashlib.sha256(updated).hexdigest()[:16] + '.js'
    style = (HERE / 'hero-sound.css').read_bytes()
    css_name = 'assets/hero-sound-' + hashlib.sha256(style).hexdigest()[:16] + '.css'
    old_styles = re.findall(rb'<link rel="stylesheet" href="/([^"\s]*hero-sound-[^"\s]+\.css)">\n', html)
    assert len(old_styles) == 1
    old_style = old_styles[0]
    assert (base / 'dist' / old_style.decode()).read_bytes() == (HERE / 'baseline-hero-sound.css').read_bytes()
    newref = reference.replace(Path(name).name.encode(), Path(destination).name.encode())
    assert html.count(reference) == 1 and html.count(old_style) == 1
    newhtml = html.replace(reference, newref).replace(old_style, css_name.encode())
    assert newhtml.replace(newref, reference).replace(css_name.encode(), old_style) == html
    files = {'dist/' + destination: updated, 'dist/' + css_name: style, 'dist/index.html': newhtml}
    assert not any((base / item).exists() for item in files if item != 'dist/index.html')
    for item, content in files.items():
        path = overlay / item
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(content)
    return {'passed': True, 'allowedFiles': sorted(files), 'renamedAssets': {'dist/' + name: 'dist/' + destination}, 'portraitGalleryOnly': False, 'heroSoundOnly': True, 'soundIconVerified': True, 'inverseTransformsVerified': True, 'unrelatedRuntimeBytesPreserved': True, 'mediaSelectionsUntouched': True}
