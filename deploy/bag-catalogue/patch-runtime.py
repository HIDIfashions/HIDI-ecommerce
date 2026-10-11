"""Add the catalogue alias without replacing any retained storefront files."""
from pathlib import Path

HERE = Path(__file__).resolve().parent

def patch_runtime(base, overlay):
    base, overlay = Path(base), Path(overlay)
    source = (base / 'server.mjs').read_text()
    original = source
    anchor = '  if (pathname === "/health") {'
    assert source.count(anchor) == 1, 'Retained request validation anchor differs'
    assert 'handleCatalogueAlias' not in source, 'Catalogue alias already installed'
    source = 'import { handleCatalogueAlias } from "./bag-catalogue/handler.mjs";\n' + source
    source = source.replace(anchor, '  if (handleCatalogueAlias(request, response, pathname)) return;\n\n' + anchor)
    restored = source.removeprefix('import { handleCatalogueAlias } from "./bag-catalogue/handler.mjs";\n')
    restored = restored.replace('  if (handleCatalogueAlias(request, response, pathname)) return;\n\n', '', 1)
    assert restored == original, 'Unrelated wrapper code must remain byte-identical'
    files = {'server.mjs': source, 'bag-catalogue/handler.mjs': (HERE / 'handler.mjs').read_text()}
    for name, text in files.items():
        target = overlay / name
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(text)
    return {'passed': True, 'allowedFiles': sorted(files), 'compiledStorefrontPreserved': True,
            'catalogueDestination': '/collections/all', 'databaseWrites': False, 'blobWrites': False}
