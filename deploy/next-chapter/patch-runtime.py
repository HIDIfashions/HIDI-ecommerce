"""Replace only the existing campaign component and append its scoped CSS.

All other component bytes, server handlers, media configuration and assets are
retained from the freshly captured production image, with inverse proofs.
"""
from pathlib import Path
import hashlib
import re

HERE = Path(__file__).resolve().parent

def bundle(source):
    text = source.decode()
    marker = 'className:"edit-section edit-section--campaign"'
    assert text.count(marker) == 1, 'One unmodified campaign component required'
    point = text.index(marker)
    start = text.rfind('function ', 0, point)
    end = text.index('function ', point)
    old = text[start:end]
    signature = re.match(r'function ([\w$]+)\(\)\{const ([\w$]+)=([\w$]+)\(\),([\w$]+)=([\w$]+)\(', old)
    assert signature, 'Campaign hook bindings must match retained source'
    name, media_var, media_hook, image_var, image_hook = signature.groups()
    # Bind to the namespace used by the retained landing-media hook, rather
    # than React's internal dispatcher (which also contains useState calls).
    context = re.search(r'function ' + re.escape(media_hook) + r'\(\)\{return ([\w$]+)\.useContext\(', text)
    assert context, 'Retained landing-media React namespace required'
    react = context.group(1)
    assert all(value not in text for value in ['HidiNextChapterReact', 'HidiNextChapterMedia', 'HidiNextChapterImage'])
    component = (HERE / 'component.runtime.js').read_text().replace('function HidiNextChapterComponent()', 'function ' + name + '()')
    # Keep production's responsive fallback image optimization, if present.
    perf = re.search(r',([\w$]+)=(' + re.escape(image_var) + r'\.src.*?);return ', old)
    if perf:
        expression = perf.group(2)
        expression = re.sub(r'\b' + re.escape(image_var) + r'\b', 'banner', expression)
        expression = re.sub(r'\b' + re.escape(media_var) + r'\b', 'landingMedia', expression)
        anchor = '  const slot = landingMedia["hidi-edit-banner"];'
        assert component.count(anchor) == 1
        component = component.replace(anchor, '  const HidiNextChapterOptimized = ' + expression + ';\n' + anchor)
        assert component.count('...banner,\n') == 1
        component = component.replace('...banner,\n', '...banner,\n        ...HidiNextChapterOptimized,\n')
    new = 'const HidiNextChapterReact=' + react + ',HidiNextChapterMedia=' + media_hook + ',HidiNextChapterImage=' + image_hook + ';\n' + component
    assert text.count(old) == 1
    updated = text.replace(old, new)
    assert updated.replace(new, old).encode() == source, 'Unrelated bundle bytes changed'
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
    style = (HERE / 'next-chapter.css').read_bytes()
    css_name = 'assets/next-chapter-' + hashlib.sha256(style).hexdigest()[:16] + '.css'
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
    return {'passed': True, 'allowedFiles': sorted(files), 'renamedAssets': {'dist/' + name: 'dist/' + destination}, 'campaignOnly': True, 'inverseTransformsVerified': True, 'unrelatedRuntimeBytesPreserved': True, 'mediaSelectionsUntouched': True}
