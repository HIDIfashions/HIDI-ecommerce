import {mkdir,writeFile} from 'node:fs/promises';
import {probe} from './browser-probes.mjs';
const report=await probe('https://hidiindia.com');
await mkdir('evidence/collection-speed',{recursive:true});
await writeFile('evidence/collection-speed/live.json',JSON.stringify(report,null,2));
console.log(JSON.stringify(report));
