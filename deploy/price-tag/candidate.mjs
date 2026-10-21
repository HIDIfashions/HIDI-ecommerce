import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
import {resolve,join} from 'node:path';
import {probe} from './probe.mjs';

const root=resolve(process.env.HIDI_CANDIDATE_RUNTIME),writes=[];
const upstream=createServer((req,res)=>{if(!['GET','HEAD'].includes(req.method))writes.push(req.method+' '+req.url);res.writeHead(401,{'content-type':'application/json'});res.end(JSON.stringify({message:'Authentication required'}));});
await new Promise(done=>upstream.listen(0,'127.0.0.1',done));const reserve=createServer();await new Promise(done=>reserve.listen(0,'127.0.0.1',done));const port=reserve.address().port;await new Promise(done=>reserve.close(done));
const url='http://127.0.0.1:'+upstream.address().port+'/v1';const child=spawn(process.execPath,[join(root,'server.mjs')],{cwd:root,env:{...process.env,PORT:String(port),API_URL:url,INTERNAL_API_URL:url},stdio:['ignore','pipe','pipe']});let logs='';child.stdout.on('data',d=>logs+=d);child.stderr.on('data',d=>logs+=d);const base='http://127.0.0.1:'+port;
try{let ready=false;for(let i=0;i<150;i++){if(child.exitCode!==null)throw Error(logs.slice(-3000));try{if((await fetch(base+'/health')).ok){ready=true;break;}}catch{}await new Promise(done=>setTimeout(done,200));}assert(ready);await probe(base,'candidate');assert.deepEqual(writes,[]);}
catch(error){console.error(logs.slice(-3000));throw error;}
finally{child.kill('SIGTERM');await new Promise(done=>{if(child.exitCode!==null)return done();child.once('exit',done);setTimeout(()=>{child.kill('SIGKILL');done();},5000).unref();});upstream.closeAllConnections();await new Promise(done=>upstream.close(done));}
