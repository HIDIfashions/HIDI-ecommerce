"""Regression for the captured hexadecimal guard and deferred input reset."""
import importlib.util,json,subprocess,tempfile,unittest
from pathlib import Path
from unittest.mock import patch as mock

spec=importlib.util.spec_from_file_location('photo_patch',Path(__file__).with_name('patch.py'))
p=importlib.util.module_from_spec(spec);spec.loader.exec_module(p)

class RetainedPhotoPatchTest(unittest.TestCase):
    def test_captured_bundle_large_file_and_event_lifetime(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp);base=root/'base';overlay=root/'overlay'
            bundle='apps/web/.next/static/chunks/admin-photo-0123456789abcdef.js'
            original='''
const label="choose a non-empty photo no larger than 12 MB; Image exceeds 12 MB.; Image must be no larger than 12 MB; up to 12 MB each";
function legacy(a){return a.size>12582912||a.size>12582912||a.size>12582912}
function validate(a){if(a.size<1||a.size>0xc00000)throw Error("choose a valid non-empty photo. Nothing was uploaded.");return true}
function reset(e){e.currentTarget.value=""}
const unrelatedLimit=0xc00000;
'''
            p.write(base,bundle,original)
            unrelated='apps/web/.next/static/chunks/other-1123456789abcdef.js'
            p.write(base,unrelated,'function unrelated(a){return a.size<1||a.size>0xc00000}')
            p.write(base,'server.mjs','\n'.join([
                'import { createProductImageHandler } from "./product-images/images.mjs";',
                'import { handlePhotoUpload } from "./photo-stream/handler.mjs";',
                'if (await handlePhotoUpload(request, response, pathname)) return;',
                'if (await productImageHandler.handle(request, response, pathname)) return;',
            ]))
            for name in ['image-sku-client.mjs','product-upload/model.mjs','product-upload/engine.mjs','product-upload/package.mjs','product-upload/page.html']:
                p.write(base,'admin-tools/'+name,'// retained helper')
            def copy_fixture(source,target):
                Path(target).write_text('// fixture module')
            def fixture_digest(path):
                return p.PIN_SERVER if Path(path).name=='server.mjs' else p.PIN_IMAGES
            with mock.object(p,'digest',side_effect=fixture_digest),mock.object(p,'git_blob',return_value=p.PIN_DELETE_STORAGE_BLOB),mock.object(p.shutil,'copyfile',side_effect=copy_fixture),mock.object(p.subprocess,'run'):
                report=p.patch(base,overlay,'web')
            self.assertEqual(report['validatorChanges']['hexadecimal'],1)
            self.assertEqual(report['validatorChanges']['lifecycleReset'],1)
            self.assertNotIn(unrelated,report['allowedFiles'])
            generated=(overlay/report['renamedAssets'][bundle]).read_text()
            self.assertIn('const unrelatedLimit=0xc00000;',generated)
            self.assertEqual((base/bundle).read_text(),original)
            script=generated+'''
const assert=require('node:assert/strict');
assert.equal(validate({size:45*1024*1024}),true);
assert.throws(()=>validate({size:0}),/non-empty photo/);
const scheduled=[];globalThis.setTimeout=fn=>scheduled.push(fn);
const input={value:'photo.jpg'},event={currentTarget:input};
reset(event);assert.equal(input.value,'photo.jpg');
event.currentTarget=null;scheduled.shift()();assert.equal(input.value,'');
input.value='photo.jpg';event.currentTarget=input;reset(event);
event.currentTarget=null;scheduled.shift()();assert.equal(input.value,'');
'''
            subprocess.run(['node','-e',script],check=True)

if __name__=='__main__':unittest.main()
