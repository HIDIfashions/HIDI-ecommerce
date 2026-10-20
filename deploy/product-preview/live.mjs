import {probe} from './probe.mjs';
import {readFile} from 'node:fs/promises';
const baselinePrivate=JSON.parse(await readFile('evidence/product-preview-release/candidate/baseline-private.json','utf8'));
await probe('https://hidiindia.com','evidence/product-preview-release/live',{baselinePrivate});
