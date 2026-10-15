"""NextURL normalizes loopback IPs to localhost. Keep test Origin and URL equal.
The production origin/CSRF authorization helper is intentionally unchanged.
"""
from pathlib import Path
p=Path('tests/photo-route-current.cases.mjs');s=p.read_text();old='http://127.0.0.1:3219';new='http://localhost:3219'
assert old in s or new in s
p.write_text(s.replace(old,new))
p=Path('tests/photo-web-upload.browser.mjs');s=p.read_text()
pairs=[("import assert from 'node:assert/strict';", "import assert from 'node:assert/strict';\nimport {setDefaultResultOrder} from 'node:dns';\nsetDefaultResultOrder('ipv4first');"),("apiPort=4219,base='http://127.0.0.1:'+port;", "apiPort=4219,base='http://localhost:'+port;")]
for before,after in pairs:
 if after in s:continue
 assert s.count(before)==1,'Unexpected fixture source: '+before
 s=s.replace(before,after,1)
p.write_text(s)
print('Test Origin and normalized NextRequest URL use localhost; listeners remain bound to 127.0.0.1. Production authorization unchanged.')
