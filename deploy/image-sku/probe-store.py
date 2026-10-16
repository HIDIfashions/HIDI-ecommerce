"""Read-only proof that the deployed web identity can load its mapping store."""
import importlib.util
import json
import os
from pathlib import Path
import pty
import re
import select
import subprocess
import time
HERE=Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location('image_sku_console',HERE.parent/'product-skn/schema-check.py');transport=importlib.util.module_from_spec(spec);spec.loader.exec_module(transport)
def verify():
    data=transport.app('hidi-web');state=transport.snapshot(data)
    assert state['latest']==state['ready'] and state['ready'],'Web revision must be ready'
    env={item['name']:item.get('value') for item in data['properties']['template']['containers'][0].get('env',[])}
    account=env.get('AZURE_STORAGE_ACCOUNT');assert isinstance(account,str) and account,'Live storage account missing'
    module='export async function verify(expected){if(process.env.AZURE_STORAGE_ACCOUNT!==expected)throw Error("Storage changed");const{createImageSkuStore}=await import("file:///app/admin-tools/image-sku-store.mjs");const store=await createImageSkuStore().read();console.log("HIDI_SKN_SCHEMA::"+JSON.stringify({passed:true,readOnly:true,storageRead:true,savedMappings:store.bindings.length,etagPresent:Boolean(store.etag)}));}'
    command=transport.console_command(module,account,'verify')
    master,slave=pty.openpty();process=subprocess.Popen(['az','containerapp','exec','-g',transport.GROUP,'-n','hidi-web','--revision',state['ready'],'--container',data['properties']['template']['containers'][0]['name'],'--command','/bin/sh','--only-show-errors'],stdin=slave,stdout=slave,stderr=slave,start_new_session=True)
    os.close(slave);os.set_blocking(master,False);output=b'';pending=b'';sent=False
    try:
        deadline=time.monotonic()+150
        while time.monotonic()<deadline:
            readable,writable,_=select.select([master],[master] if pending else [],[],1)
            if writable:
                try:pending=pending[os.write(master,pending[:2048]):]
                except BlockingIOError:pass
            if readable:
                try:chunk=os.read(master,65536)
                except BlockingIOError:continue
                except OSError:break
                if not chunk:break
                output+=chunk;assert len(output)<256*1024,'Console limit exceeded'
                plain=transport.terminal_text(output.decode(errors='replace'))
                if not sent and re.search(r'(?:^|[\r\n])[^\r\n]{0,160}[#$] $',plain):pending=command.encode();sent=True
                if transport.complete_marker(plain,transport.MARKER) or transport.complete_marker(plain,transport.FAILURE_MARKER):break
            if process.poll() is not None:break
        report=transport.complete_marker(output.decode(errors='replace'),transport.MARKER)
        assert report and report.get('passed') is True and report.get('readOnly') is True and report.get('storageRead') is True,'Managed identity mapping storage read was not confirmed'
        assert transport.snapshot(transport.app('hidi-web'))==state,'Web changed during mapping store verification'
        path=Path('evidence/image-sku/storage-read.json');path.parent.mkdir(parents=True,exist_ok=True);path.write_text(json.dumps(report,indent=2)+'\n')
        print('PASS: live web managed identity mapping storage read; no Blob writes')
    finally:
        os.close(master)
        if process.poll() is None:
            process.terminate()
            try:process.wait(timeout=10)
            except subprocess.TimeoutExpired:process.kill();process.wait(timeout=10)
if __name__=='__main__':verify()
