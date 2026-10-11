"""Add the hero audio control without changing other live components or assets."""
from pathlib import Path
import importlib.util
import hashlib
import re
HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('hero_component_parser', HERE.parent / 'portrait-gallery/patch-runtime.py')
parser = importlib.util.module_from_spec(spec)
spec.loader.exec_module(parser)

def bundle(source):
    text = source.decode()
    marker = 'className:"hero hero--campaign"'
    assert text.count(marker) == 1
    start = text.rfind('function ', 0, text.index(marker))
    old = text[start:parser.component_end(text, start)]
    sig = re.match(r'function ([\w$]+)\(\)\{const\{openCollection:[\w$]+,dialogOpen:[\w$]+\}=([\w$]+)\(\),[\w$]+=([\w$]+)\("\(max-width: 700px\)"\),[\w$]+=([\w$]+)\(\),[\w$]+=([\w$]+)\(\),[\w$]+=([\w$]+)\.useRef\(null\),[\w$]+=[\w$]+\.useRef\(null\),[\w$]+=([\w$]+)\(', old)
    assert sig, 'Retained hero bindings required'
    name, context, query, reduced, visible, react, inview = sig.groups()
    asset = re.search(r'=([\w$]+)\(`video/hidi-hero-', old)
    safe = re.search(r'\?([\w$]+)\([\w$]+\.url\):""', old)
    sequence = re.search(r'=([\w$]+)\(\{items:', old)
    controls = re.search(r'jsx\(([\w$]+),\{items:[\w$]+,sequence:[\w$]+,label:"hero media"', old)
    assert asset and safe and sequence and controls
    bindings = {'React': react, 'Context': context, 'Query': query, 'Reduced': reduced, 'Visible': visible, 'InView': inview, 'Asset': asset.group(1), 'SafeUrl': safe.group(1), 'Sequence': sequence.group(1), 'Controls': controls.group(1)}
    assert all('HidiHero' + key not in text for key in bindings)
    component = (HERE / 'component.runtime.js').read_text().replace('function HidiHeroComponent()', 'function ' + name + '()')
    new = 'const ' + ','.join('HidiHero' + key + '=' + value for key, value in bindings.items()) + ';\n' + component
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
    link = ('<link rel="stylesheet" href="/' + css_name + '">\n').encode()
    newref = reference.replace(Path(name).name.encode(), Path(destination).name.encode())
    assert html.count(reference) == 1 and html.count(b'</head>') == 1
    newhtml = html.replace(reference, newref).replace(b'</head>', link + b'</head>')
    assert newhtml.replace(newref, reference).replace(link, b'') == html
    files = {'dist/' + destination: updated, 'dist/' + css_name: style, 'dist/index.html': newhtml}
    assert not any((base / item).exists() for item in files if item != 'dist/index.html')
    for item, content in files.items():
        path = overlay / item
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(content)
    return {'passed': True, 'allowedFiles': sorted(files), 'renamedAssets': {'dist/' + name: 'dist/' + destination}, 'portraitGalleryOnly': False, 'heroSoundOnly': True, 'inverseTransformsVerified': True, 'unrelatedRuntimeBytesPreserved': True, 'mediaSelectionsUntouched': True}
