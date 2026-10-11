"""Add only product footer clearance to the freshly captured live wrapper."""
from pathlib import Path

HERE = Path(__file__).resolve().parent
MARKER = '/* hidi-product-footer-clearance */'

def patch_text(original):
    anchor = 'const storefrontLayerFix = `'
    assert original.count(anchor) == 1, 'Exact retained storefront style anchor required'
    assert MARKER not in original, 'Footer clearance already installed'
    start = original.index(anchor)
    end = original.index('</style>', start)
    css = (HERE/'footer.css').read_text()
    assert '`' not in css and '${' not in css and '<' not in css
    addition = '\n' + MARKER + '\n' + css + '\n'
    updated = original[:end] + addition + original[end:]
    assert updated.replace(addition, '', 1) == original, 'Unrelated wrapper bytes changed'
    return updated

def patch_runtime(base, overlay):
    base, overlay = Path(base), Path(overlay)
    original = (base/'server.mjs').read_text()
    updated = patch_text(original)
    target = overlay/'server.mjs'; target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(updated)
    return {'passed': True, 'allowedFiles': ['server.mjs'], 'footerStylesOnly': True,
            'inverseTransformsVerified': True, 'databaseWrites': False, 'blobWrites': False}
