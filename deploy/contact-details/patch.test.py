import importlib.util
import json
from pathlib import Path
import re

spec=importlib.util.spec_from_file_location('patch',Path(__file__).with_name('patch-runtime.py'))
patch=importlib.util.module_from_spec(spec);spec.loader.exec_module(patch)
source='UNRELATED_BEFORE,'+json.dumps(patch.PLAIN_DETAILS,ensure_ascii=False)+',UNRELATED_AFTER'
updated=patch.patch_text(source)
assert updated.startswith('UNRELATED_BEFORE,') and updated.endswith(',UNRELATED_AFTER')
assert re.sub(r'<svg[\s\S]*?</svg>','',patch.DETAILS)==patch.PLAIN_DETAILS
assert patch.DETAILS.count('data-hidi-contact-icon=')==4
assert patch.DETAILS.count('aria-hidden="true"')==4
assert patch.DETAILS.count('focusable="false"')==4
print('PASS: four decorative contact icons added; all contact text, links and unrelated page bytes preserved')
