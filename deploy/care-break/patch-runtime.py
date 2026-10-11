"""Move the existing care section and append only its scoped compact styling."""
from pathlib import Path
import hashlib
import re

HERE = Path(__file__).resolve().parent

def bundle(source):
    text = source.decode()
    care_class = 'className:"promises-section section-space"'
    assert text.count(care_class) == 1, 'Exactly one existing care section required'
    care_point = text.index(care_class)
    campaign = list(re.finditer(r'id:\s*"hidi-edit"', text))
    assert len(campaign) == 1, 'Exactly one retained next chapter required'
    def component_at(point):
        matches = list(re.finditer(r'function\s+([\w$]+)\s*\(', text[:point]))
        assert matches
        return matches[-1].group(1)
    care, chapter = component_at(care_point), component_at(campaign[0].start())
    pair = re.compile(r'([\w$]+)\.jsx\(' + re.escape(chapter) + r',\{\}\),\1\.jsx\(' + re.escape(care) + r',\{\}\)')
    matches = list(pair.finditer(text))
    assert len(matches) == 1, 'Existing chapter/care adjacency must match approved page'
    old = matches[0].group(0)
    jsx = matches[0].group(1)
    new = jsx + '.jsx(' + care + ',{}),' + jsx + '.jsx(' + chapter + ',{})'
    new_class = 'className:"promises-section section-space care-break"'
    updated = text.replace(old, new).replace(care_class, new_class)
    assert updated.replace(new, old).replace(new_class, care_class).encode() == source
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
    style = (HERE / 'care-break.css').read_bytes()
    css_name = 'assets/care-break-' + hashlib.sha256(style).hexdigest()[:16] + '.css'
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
    return {'passed': True, 'allowedFiles': sorted(files), 'renamedAssets': {'dist/' + name: 'dist/' + destination}, 'careBreakOnly': True, 'singleCareSection': True, 'correctSectionOrder': True, 'inverseTransformsVerified': True, 'unrelatedRuntimeBytesPreserved': True, 'mediaSelectionsUntouched': True}
