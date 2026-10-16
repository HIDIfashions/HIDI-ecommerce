from pathlib import Path
import importlib.util
import tempfile

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('countdown_patch', HERE/'patch-runtime.py')
patcher = importlib.util.module_from_spec(spec)
spec.loader.exec_module(patcher)
with tempfile.TemporaryDirectory() as temp:
    root = Path(temp); base = root/'base'; overlay = root/'overlay'
    (base/'dist').mkdir(parents=True)
    original = '<!doctype html><html><head><title>Current HIDI homepage</title></head><body><div id="root"></div></body></html>'
    (base/'dist/index.html').write_text(original)
    result = patcher.patch_runtime(base, overlay)
    assert result['passed'] and len(result['allowedFiles']) == 3
    assert (overlay/'dist/index.html').read_text().replace(patcher.INJECTION, '', 1) == original
    assert (base/'dist/index.html').read_text() == original
    for asset, source in patcher.ASSETS.items(): assert (overlay/'dist'/asset).read_bytes() == (HERE/source).read_bytes()
    (base/'dist/index.html').write_text((overlay/'dist/index.html').read_text())
    try: patcher.patch_runtime(base, root/'again')
    except AssertionError: pass
    else: raise AssertionError('An existing countdown cannot be overwritten implicitly')
print('PASS: homepage preservation, exact assets and duplicate-release guard')
