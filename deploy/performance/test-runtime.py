"""Exercise the actual candidate runtime with the existing 21 media/security/proxy regressions."""
from pathlib import Path
import subprocess
import sys

candidate=Path(sys.argv[1]).resolve();test=Path(sys.argv[2]).resolve()
source=test.read_text()
source=source.replace('const runtime = fileURLToPath(new URL("./server.mjs", import.meta.url));','const runtime = '+repr(str(candidate/'server.mjs'))+';')
# Decode HTTP content before running the original semantic assertions.
source='import { gunzipSync, brotliDecompressSync } from "node:zlib";\n'+source
anchor='body: Buffer.concat(chunks).toString()'
assert source.count(anchor)==3
source=source.replace(anchor,'body: (incoming.headers["content-encoding"] === "gzip" ? gunzipSync(Buffer.concat(chunks)) : incoming.headers["content-encoding"] === "br" ? brotliDecompressSync(Buffer.concat(chunks)) : Buffer.concat(chunks)).toString()',1)
anchor='assert.equal(admin.headers["content-length"], String(Buffer.byteLength(admin.body)));'
assert source.count(anchor)==1
source=source.replace(anchor,'assert.equal(admin.headers["content-length"], undefined); assert.equal(admin.headers["content-encoding"], "gzip");')
target=test.parent/'.performance-runtime.test.mjs';target.write_text(source)
try:subprocess.run(['node','--test',str(target)],check=True)
finally:target.unlink(missing_ok=True)
