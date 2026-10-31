// Extend the existing isolated production-runtime commerce harness.
import assert from 'node:assert/strict';
import {readFile,writeFile,unlink} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const source=await readFile(new URL('../get1/browser-check.mjs',import.meta.url),'utf8');
const marker='const additions=`';assert.equal(source.split(marker).length,2);
const updated=source.replace(marker,marker+"\n  await (await import('../launch-strip-removal/probe.mjs')).probe(base);\n");
const target=new URL('../get1/launch-strip-temp.mjs',import.meta.url);await writeFile(target,updated);
try{const result=spawnSync(process.execPath,[fileURLToPath(target)],{stdio:'inherit'});assert.equal(result.status,0,'Landing page and retained commerce regressions');}finally{await unlink(target);}
