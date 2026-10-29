import assert from 'node:assert/strict';import {readFile,writeFile,unlink} from 'node:fs/promises';import {spawnSync} from 'node:child_process';import {fileURLToPath} from 'node:url';
const path=new URL('../checkout-offers/welcome250-candidate-temp.mjs',import.meta.url),source=await readFile(new URL('../checkout-offers/candidate.mjs',import.meta.url),'utf8'),marker="  const purchase=await import('../purchase-actions/probes.mjs');";
assert.equal(source.split(marker).length,2);
await writeFile(path,source.replace(marker,"  await (await import('../welcome250/welcome-browser.mjs')).probe(base,{setSubtotal:value=>fixtureSubtotal=value});\n"+marker));
try{const result=spawnSync(process.execPath,[fileURLToPath(path)],{stdio:'inherit'});assert.equal(result.status,0,'Retained checkout browser regression failed');}finally{await unlink(path);}
