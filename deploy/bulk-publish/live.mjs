import {probe} from '../four-categories/browser-probes.mjs';
import {writeFile} from 'node:fs/promises';
const report=await probe('https://hidiindia.com','evidence/bulk-publish/live-categories',{candidate:false});
await writeFile('evidence/bulk-publish/live.json',JSON.stringify(report,null,2));
