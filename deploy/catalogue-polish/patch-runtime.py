"""Prepare a reversible CSS-only wrapper overlay; never deploy or contact Azure."""
from pathlib import Path
import hashlib

HERE = Path(__file__).resolve().parent
MARKER = '/* hidi-catalogue-polish-20261013 */'

def patch_text(original):
    anchor = 'const storefrontLayerFix = `'
    assert original.count(anchor) == 1, 'One retained storefront CSS injection block required'
    assert MARKER not in original, 'Catalogue refinement is already installed'
    start = original.index(anchor) + len(anchor)
    end = original.index('</style>', start)
    block = original[start:end]
    assert block.lstrip().startswith('<style data-hidi-storefront-layer-fix="true">'), 'Retained style block differs'
    css = (HERE / 'catalogue-polish.css').read_text()
    assert all(value not in css for value in ['`', '${', '<', 'url(', '@import']), 'Inline CSS must not contain executable code or network imports'
    addition = '\n' + MARKER + '\n' + css + '\n'
    updated = original[:end] + addition + original[end:]
    assert updated.replace(addition, '', 1) == original, 'Unrelated wrapper bytes changed'
    return updated

def patch_runtime(base, overlay):
    base, overlay = Path(base), Path(overlay)
    source = base / 'server.mjs'
    assert source.is_file() and not source.is_symlink()
    original = source.read_text()
    updated = patch_text(original)
    destination = overlay / 'server.mjs'
    assert not destination.exists() and not overlay.is_symlink(), 'Fresh regular overlay required'
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(updated)
    return {'passed': True, 'allowedFiles': ['server.mjs'], 'catalogueCssOnly': True,
            'beforeSha256': hashlib.sha256(original.encode()).hexdigest(),
            'afterSha256': hashlib.sha256(updated.encode()).hexdigest(),
            'inverseTransformsVerified': True, 'applicationJavaScriptUnchanged': True,
            'compiledNextUnchanged': True, 'apiUnchanged': True, 'databaseWrites': False,
            'storageWrites': False, 'deploymentPerformed': False}
