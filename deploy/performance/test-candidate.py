"""Run existing assertions against extracted compiled candidate bytes, using isolated commerce fixtures."""
from pathlib import Path
import os
import subprocess
import sys

app = Path(sys.argv[1]).resolve()
env = os.environ.copy();env['HIDI_BROWSER_ENGINES']='chromium,firefox,webkit'
cases = [('editorial-storefront',3107),('editorial-polish',3117),('admin-workspace',3100),('auth-otp-resend',3116)]
for name, port in cases:
    source=Path('tests/'+name+'.browser.mjs').read_text()
    # Keep every browser assertion and API fixture unchanged. Replace only
    # the launch target/cwd/port with the exact built standalone server.
    import re
    pattern=r"\[resolve\('apps/web/node_modules/next/dist/bin/next'\),\s*'start',\s*'-H',\s*'127.0.0.1',\s*'-p',\s*(?:String\(port\)|'3117')\]"
    source,n=re.subn(pattern,repr([str(app/'apps/web/server.js')]),source);assert n==1, name
    source,n=re.subn(r"cwd:\s*resolve\('apps/web'\)","cwd: "+repr(str(app/'apps/web')),source);assert n==1,name
    # Admin fixture defines its own port; use that existing variable.
    port_value="String(port)" if name!='editorial-polish' else "'3117'"
    source,n=re.subn(r'env:\s*\{\s*\.\.\.process.env,',"env: {...process.env, PORT: "+port_value+", HOSTNAME:'127.0.0.1',",source,count=1);assert n==1,name
    target=Path('tests/.performance-'+name+'.browser.mjs');target.write_text(source)
    try:
        if name=='admin-workspace':
            for engine in ['chromium','firefox','webkit']:
                subprocess.run(['node',str(target)],env={**env,'HIDI_BROWSER_ENGINE':engine},check=True)
        else:subprocess.run(['node',str(target)],env=env,check=True)
    finally:target.unlink(missing_ok=True)
