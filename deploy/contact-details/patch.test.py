import importlib.util
from pathlib import Path

spec=importlib.util.spec_from_file_location('patch',Path(__file__).with_name('patch-runtime.py'))
patch=importlib.util.module_from_spec(spec);spec.loader.exec_module(patch)
section='(0,e.jsxs)("section",{className:t.default.notice,"aria-label":"Contact HIDI",children:[(0,e.jsx)("h2",{children:"Talk to HIDI"}),s.phone&&(0,e.jsx)("a",{href:`https://wa.me/${s.phone}`,children:"{phone}"}),(0,e.jsx)("p",{children:"'+patch.INTRO+'"}),(0,e.jsx)("p",{children:"'+patch.GUIDANCE+'"})]})'
source='UNRELATED_BEFORE,'+section+',UNRELATED_AFTER'
updated=patch.patch_text(source)
assert updated.startswith('UNRELATED_BEFORE,') and updated.endswith(',UNRELATED_AFTER')
assert patch.INTRO not in updated
for value in ['https://wa.me/917093709353','tel:+917093709353','mailto:contact@hidiindia.com','Hyma Arcade','500081','Talk to HIDI',patch.GUIDANCE]: assert value in updated
print('PASS: contact card replaced; surrounding page and customer guidance preserved')
