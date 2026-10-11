"""Apply the requested playlist edit through the existing live managed identity."""
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
def load(name,path):
    spec=importlib.util.spec_from_file_location(name,path)
    module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module);return module
cloud=load('hero_selection_cloud',HERE.parent/'privacy-policy/rollout.py')
console=load('hero_selection_console',HERE.parent/'product-skn/schema-check.py')
cloud.API_VERSION='2025-07-01';cloud.BASE='https://hidiindia.com'
MARKER='HIDI_HERO_SELECTION'

def main():
    web=cloud.app('hidi-web');api=cloud.snapshot(cloud.app('hidi-api'));state=cloud.snapshot(web);cloud.ready(state)
    public={path:cloud.get(path) for path in ['/api/hidi/landing-media-config','/api/hidi/privacy-policy','/config.js']}
    env={item['name']:item.get('value','') for item in web['properties']['template']['containers'][0].get('env',[])}
    account=env['AZURE_STORAGE_ACCOUNT'];assert re.fullmatch(r'[a-z0-9]{3,24}',account)
    owner={'run':os.environ['GITHUB_RUN_ID']+'-'+os.environ.get('GITHUB_RUN_ATTEMPT','1')}
    command=console.console_command((HERE/'selection.mjs').read_text(),account,'run',owner).replace('HIDI_SKN_SCHEMA',MARKER)
    master,slave=pty.openpty()
    process=subprocess.Popen(['az','containerapp','exec','-g',cloud.GROUP,'-n','hidi-web','--revision',state['ready'],'--container',web['properties']['template']['containers'][0]['name'],'--command','/bin/sh','--only-show-errors'],stdin=slave,stdout=slave,stderr=slave,start_new_session=True)
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
                output+=chunk;assert len(output)<512*1024
                plain=console.terminal_text(output.decode(errors='replace'))
                if not sent and re.search(r'(?:^|[\r\n])[^\r\n]{0,160}[#$] $',plain):pending=command.encode();sent=True
                if console.complete_marker(plain,MARKER) or console.complete_marker(plain,MARKER+'_FAILED'):break
            if process.poll() is not None:break
        report=console.complete_marker(output.decode(errors='replace'),MARKER)
        assert report and report.get('passed') and report.get('sampleRemoved') and report.get('databaseWrites') is False,'Guarded hero selection edit was not confirmed'
        assert cloud.snapshot(cloud.app('hidi-web'))==state and cloud.snapshot(cloud.app('hidi-api'))==api
        assert all(cloud.get(path)==value for path,value in public.items()),'Unrelated public content changed'
        current=json.loads(cloud.get('/api/hidi/hero-config'))
        assert all(i.get('assetId')!='b135682c-f693-4761-8e9c-2455135d4895' for i in current['items'])
        assert any(i.get('assetId')=='ccb85470-43bb-4544-a533-7f0edcf927ac' for i in current['items'])
        out=Path('evidence/hero-sound');out.mkdir(parents=True,exist_ok=True);(out/'selection.json').write_text(json.dumps(report,indent=2)+'\n')
        print('PASS: SAMPLE.mp4 removed from hero playlist; IMG_3757.mp4 and all media files retained')
    finally:
        os.close(master)
        if process.poll() is None:
            process.terminate()
            try:process.wait(timeout=10)
            except subprocess.TimeoutExpired:process.kill();process.wait(timeout=10)
if __name__=='__main__':main()
