/** Real browser execution of the same standalone modules served by admin tools. */
import {createServer} from 'node:http';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {handleQuickTools} from '../deploy/admin-tools/handler.mjs';
const pw=await import(pathToFileURL(process.env.HIDI_PLAYWRIGHT_MODULE).href),results=[];
const out=resolve('test-results/photo-digest');await mkdir(out,{recursive:true});
const server=createServer(async(req,res)=>{try{const path=new URL(req.url,'http://localhost').pathname;if(await handleQuickTools(req,res,path))return;res.writeHead(200,{'content-type':'text/html'});res.end('<!doctype html><title>Isolated digest fixture</title>');}catch{res.writeHead(500);res.end();}});
await new Promise(done=>server.listen(0,'127.0.0.1',done));let browser;
try{for(const engine of ['chromium','firefox','webkit']){
 try{browser=await pw[engine].launch({headless:true});const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(String(e)));await page.goto('http://127.0.0.1:'+server.address().port);
 const digest=await page.evaluate(async()=>{const {photoDigest}=await import('/admin-tools-assets/photo-digest.mjs');const file=new File([new Uint8Array(3*1024*1024).fill(90)],'photo.bin');file.arrayBuffer=()=>{throw new Error('Whole-file buffering is forbidden');};return photoDigest(file);});
 assert.equal(digest,createHash('sha256').update(Buffer.alloc(3*1024*1024,90)).digest('hex'));assert.deepEqual(errors,[]);results.push({engine,case:'Standalone admin SHA-256 without whole-file arrayBuffer',status:'PASS'});
 }catch(error){results.push({engine,case:'Standalone admin SHA-256 without whole-file arrayBuffer',status:'FAIL',error:String(error.stack||error)});}finally{await browser?.close();browser=null;}
}}finally{await new Promise(done=>server.close(done));await writeFile(resolve(out,'results.json'),JSON.stringify({results,liveWrites:0},null,2));}
console.log(JSON.stringify(results));assert.equal(results.filter(r=>r.status==='FAIL').length,0);
