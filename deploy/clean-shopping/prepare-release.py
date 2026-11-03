"""Prepare this release's isolated patch compiler and established release guard."""
from pathlib import Path
root=Path(__file__).resolve().parents[2]
here=root/'deploy/clean-shopping'
source=(root/'deploy/product-page/patch.mjs').read_text(encoding='utf-8')
prefix=source.split("const components=")[0]
(here/'patch.mjs').write_text(prefix+(here/'patch-tail.mjs').read_text(encoding='utf-8'),encoding='utf-8')
release=(root/'deploy/search-priority/release.py').read_text(encoding='utf-8').replace('search-priority','clean-shopping').replace('searchpriority','cleanshopping')
release=release.replace("plan=patcher.patch_runtime(base,overlay);save('patch.json',plan)","subprocess.run(['node',str(HERE/'patch.mjs'),str(base),str(overlay)],check=True);plan=read('patch.json')")
release=release.replace("patcher=load('india_seo_patch',HERE/'patch-runtime.py')", "")
release=release.replace("HERE/'flatten-image.py'","HERE.parent/'search-priority/flatten-image.py'")
(here/'release.py').write_text(release,encoding='utf-8')
candidate=(root/'deploy/search-priority/candidate.mjs').read_text(encoding='utf-8').replace('search-priority','clean-shopping')
(here/'candidate.mjs').write_text(candidate,encoding='utf-8')
(here/'media-preload.mjs').write_bytes((root/'deploy/search-priority/media-preload.mjs').read_bytes())
probes=(root/'deploy/search-priority/probes.mjs').read_text(encoding='utf-8').replace("new URL('./copy.json',import.meta.url)","new URL('../search-priority/copy.json',import.meta.url)").replace('evidence/search-priority','evidence/clean-shopping')
probes=probes.replace("import assert from 'node:assert/strict';", "import assert from 'node:assert/strict';\nimport {checkCollection,checkProductDetails} from '../../tests/clean-shopping-checks.mjs';")
probes=probes.replace("decoded.includes(copy.intro)","decoded.includes('Discover HIDI kurta sets')")
probes=probes.replace("await page.getByText(copy.intro,{exact:true}).waitFor();assert.equal(await page.title(),copy.collectionTitle);", "await checkCollection(page);assert.equal(await page.title(),copy.collectionTitle);")
probes=probes.replace("await page.screenshot({path:`${output}/${engine}-${width}-product.png`});", "await page.locator('[data-hidi-react-pdp][data-hidi-hydrated=\"true\"]').waitFor();await checkProductDetails(page);await page.screenshot({path:`${output}/${engine}-${width}-product.png`});")
(here/'probes.mjs').write_text(probes,encoding='utf-8')
