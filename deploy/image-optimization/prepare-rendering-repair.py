"""One-time transparent source assembly, restricted to the isolated candidate."""
from pathlib import Path
import json,runpy,subprocess
root=Path.cwd()
runpy.run_path(str(root/'deploy/image-optimization/repair-rendering-tests.py'),run_name='__main__')
files=json.loads((root/'rendering-repair-files.json').read_text())
current=root/'tests/image-sku-runtime-keys.test.mjs'
retained=root/'tests/retained/image-sku-runtime-keys.test.mjs'
dispatch="""// Retained-container checks run only against an explicitly supplied snapshot.
// Fresh-source CI exercises the real current route, parser and authorization instead.
if (process.env.HIDI_CANDIDATE_RUNTIME) {
  await import('./retained/image-sku-runtime-keys.test.mjs');
} else {
  await import('./photo-route-current.cases.mjs');
}
"""
if current.read_text()!=dispatch:
 if retained.exists():raise ValueError('Retained fixture already exists; review before replacing')
 retained.parent.mkdir(parents=True,exist_ok=True);retained.write_text(current.read_text())
 current.write_text(dispatch);files+=['tests/image-sku-runtime-keys.test.mjs','tests/retained/image-sku-runtime-keys.test.mjs']
subprocess.run(['node','deploy/image-optimization/bundle-browser-digest.mjs'],check=True)
files+=['deploy/admin-tools/photo-digest.mjs','deploy/product-upload/photo-digest.mjs']
(root/'rendering-repair-files.json').write_text(json.dumps(sorted(set(files)),indent=2))
print('Prepared actual route, browser bundles and approved rendering assertions. No production changes.')
