"""Replace only the portrait component; retain all unrelated production bytes."""
from pathlib import Path
import hashlib
import re
HERE = Path(__file__).resolve().parent

def component_end(text, start):
    depth, quote, escape = 0, None, False
    for index in range(text.index('{', start), len(text)):
        char = text[index]
        if quote:
            if escape: escape = False
            elif char == '\\': escape = True
            elif char == quote: quote = None
        elif char in "\"'`": quote = char
        elif char == '{': depth += 1
        elif char == '}':
            depth -= 1
            if not depth: return index + 1
    raise AssertionError('Unclosed portrait component')

def bundle(source):
    text = source.decode()
    marker = 'className:"meet-section meet-section--cinematic meet-section--single"'
    assert text.count(marker) == 1, 'One retained portrait section required'
    start = text.rfind('function ', 0, text.index(marker))
    old = text[start:component_end(text, start)]
    signature = re.match(r'function ([\w$]+)\(\)\{const [\w$]+=([\w$]+)\(\),\{dialogOpen:[\w$]+\}=([\w$]+)\(\),[\w$]+=([\w$]+)\.useRef\(null\),[\w$]+=([\w$]+)\([\w$]+\),[\w$]+=([\w$]+)\(\)', old)
    assert signature, 'Retained media, visibility and context hooks required'
    name, media, context, react, inview, document = signature.groups()
    sequence = re.search(r'=([\w$]+)\(\{items:', old)
    image = re.search(r'props:([\w$]+)\(\{ananya:', old)
    assert sequence and image
    bindings = {'React': react, 'Media': media, 'Context': context, 'InView': inview, 'DocumentVisible': document, 'Sequence': sequence.group(1), 'Image': image.group(1)}
    assert all('HidiPortrait' + key not in text for key in bindings)
    component = (HERE / 'component.runtime.js').read_text().replace('function HidiPortraitComponent()', 'function ' + name + '()')
    new = 'const ' + ','.join('HidiPortrait' + key + '=' + value for key, value in bindings.items()) + ';\n' + component
    updated = text.replace(old, new)
    assert updated.replace(new, old).encode() == source, 'Unrelated JavaScript bytes changed'
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
    style = (HERE / 'portrait-gallery.css').read_bytes()
    css_name = 'assets/portrait-gallery-' + hashlib.sha256(style).hexdigest()[:16] + '.css'
    link = ('<link rel="stylesheet" href="/' + css_name + '">\n').encode()
    newref = reference.replace(Path(name).name.encode(), Path(destination).name.encode())
    assert html.count(reference) == 1 and html.count(b'</head>') == 1
    newhtml = html.replace(reference, newref).replace(b'</head>', link + b'</head>')
    assert newhtml.replace(newref, reference).replace(link, b'') == html
    files = {'dist/' + destination: updated, 'dist/' + css_name: style, 'dist/index.html': newhtml}
    for photo in sorted((HERE / 'photos').glob('*.jpg')):
        files['dist/assets/images/ananya-portraits/' + photo.name] = photo.read_bytes()
    assert len(files) == 8
    assert not any((base / item).exists() for item in files if item != 'dist/index.html')
    for item, content in files.items():
        path = overlay / item
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(content)
    return {'passed': True, 'allowedFiles': sorted(files), 'renamedAssets': {'dist/' + name: 'dist/' + destination}, 'portraitGalleryOnly': True, 'inverseTransformsVerified': True, 'unrelatedRuntimeBytesPreserved': True, 'mediaSelectionsUntouched': True}
