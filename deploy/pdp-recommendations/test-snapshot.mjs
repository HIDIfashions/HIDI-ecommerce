import {createServer} from 'node:http';
import {mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import assert from 'node:assert/strict';
import {snapshotServer} from './snapshot-server.mjs';
const calls=new Map();let recovered=false;
const upstream=createServer((req,res)=>{
 const count=(calls.get(req.url)||0)+1;calls.set(req.url,count);
 const status=req.url==='/transient'&&count===1?503:req.url==='/missing'&&!recovered?404:200;
 res.writeHead(status,{'Content-Type':status===200?'image/jpeg':'text/plain'}).end(status===200?'verified fixture bytes':'not ready');
});
await new Promise(done=>upstream.listen(0,'127.0.0.1',done));
const directory=await mkdtemp(join(tmpdir(),'hidi-snapshot-test-'));
const options={directory,css:'',upstream:'http://127.0.0.1:'+upstream.address().port};
let snapshot=await snapshotServer(options);
try{
 assert.equal((await snapshot.pull('/transient')).status,200);
 assert.equal(calls.get('/transient'),2,'Retry transient upstream response');
 assert.deepEqual(snapshot.manifest[0].attemptStatuses,[503,200]);
 assert.equal((await snapshot.pull('/transient')).body.toString(),'verified fixture bytes');
 assert.equal(calls.get('/transient'),2,'Reuse successful responses');
 assert.equal((await snapshot.pull('/missing')).status,404);
 assert.equal((await snapshot.pull('/missing')).status,404);
 assert.equal(calls.get('/missing'),2,'Never cache a failed response');
 const denied=await fetch(snapshot.base+'/write',{method:'POST'});assert.equal(denied.status,405);assert.equal(calls.get('/write'),undefined);
 await snapshot.save();await snapshot.close();recovered=true;
 snapshot=await snapshotServer(options);
 assert.equal((await snapshot.pull('/missing')).status,200,'Do not reload old failures from disk');
 assert.equal(calls.get('/missing'),3);
 console.log('PASS: transient fixture retry, successful-byte caching, failure eviction, and no upstream writes');
}finally{await snapshot.close();upstream.closeAllConnections();await new Promise(done=>upstream.close(done));}
