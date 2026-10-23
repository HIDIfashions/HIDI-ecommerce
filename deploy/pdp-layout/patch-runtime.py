"""Prepare the reviewed CSS overlay. No deployment or upstream writes."""
from pathlib import Path
import hashlib

HERE = Path(__file__).resolve().parent
MARKER = '/* hidi-pdp-layout-20261023 */'

def patch_text(original):
    anchor = 'const storefrontLayerFix = `'
    assert original.count(anchor) == 1, 'Exactly one retained storefront style block required'
    assert MARKER not in original, 'PDP layout overlay is already present'
    start = original.index(anchor) + len(anchor)
    end = original.index('</style>', start)
    assert original[start:end].lstrip().startswith('<style data-hidi-storefront-layer-fix="true">')
    css = (HERE / 'pdp-layout.css').read_text(encoding='utf-8')
    assert not any(value in css for value in ['`', '${', '<', 'url(', '@import'])
    addition = '\n' + MARKER + '\n' + css + '\n'
    updated = original[:end] + addition + original[end:]
    assert updated.replace(addition, '', 1) == original, 'Unrelated runtime bytes changed'
    return updated

def patch_runtime(base, overlay):
    base, overlay = Path(base), Path(overlay)
    source = base / 'server.mjs'
    target = overlay / 'server.mjs'
    assert source.is_file() and not source.is_symlink()
    assert not target.exists() and not overlay.is_symlink()
    original = source.read_bytes()
    updated = patch_text(original.decode()).encode()
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(updated)
    return {'passed': True, 'allowedFiles': ['server.mjs'],
            'beforeSha256': hashlib.sha256(original).hexdigest(),
            'afterSha256': hashlib.sha256(updated).hexdigest(),
            'inverseTransformVerified': True, 'cssOnly': True,
            'compiledNextUnchanged': True, 'apiUnchanged': True,
            'upstreamWrites': 0, 'deploymentPerformed': False}
