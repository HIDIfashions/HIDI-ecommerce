import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {snapshotServer} from './snapshot-server.mjs';
const css=await readFile(new URL('./pdp-layout.css',import.meta.url),'utf8');
const snapshot=await snapshotServer({directory:resolve('outputs/pdp-layout/snapshot'),css,candidate:true});
console.log('PREVIEW '+snapshot.base+'/products/kur-036-women-s-wine-purple-embroidered-kurta-set-with-dupatta');
setInterval(()=>snapshot.save().catch(console.error),10000).unref();
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,async()=>{await snapshot.save();await snapshot.close();process.exit(0);});
