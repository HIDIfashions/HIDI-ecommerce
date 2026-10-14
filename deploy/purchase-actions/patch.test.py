import importlib.util
from pathlib import Path

spec=importlib.util.spec_from_file_location('patch',Path(__file__).with_name('patch-runtime.py'))
patch=importlib.util.module_from_spec(spec);spec.loader.exec_module(patch)
source='if(clear(""),!selection){mark(!0),error("Choose your size above to continue.");return}await write(selection.id);route("/checkout");'
source+=','.join('disabled:busy||!inStock||!selection||"added"===phase' for _ in range(5))
source+=';className:css().mobileInlineFeedback,role:failure?"alert":"status",children:failure||message||(selection?"":"Choose a size to add this piece.");label="Add to Bag";'
result=patch.patch_card(source)
assert result.count('disabled:busy||!inStock||"added"===phase')==5
assert '!selection){mark(!0),error("Select a size to continue.");return}' in result
assert 'await write(selection.id);route("/checkout");' in result
assert 'failure?css().error' in result
print('PASS: missing-size early return, stock/busy/success guards and transaction destination preserved')
