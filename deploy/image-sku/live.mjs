import {probe} from '../four-categories/browser-probes.mjs';
import {writeFile} from 'node:fs/promises';
const report=await probe('https://hidiindia.com','evidence/image-sku/live-categories',{candidate:false});
await writeFile('evidence/image-sku/live.json',JSON.stringify(report,null,2));
