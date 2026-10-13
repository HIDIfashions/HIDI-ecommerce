// Anonymous GET/HEAD snapshot only. There is no upstream write or deployment path.
import {createServer} from 'node:http';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createHash} from 'node:crypto';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
const execute = promisify(execFile);
const hash = value => createHash('sha256').update(value).digest('hex');

export async function snapshotServer({directory,css,candidate=false,upstream='https://hidiindia.com'}) {
  await mkdir(directory,{recursive:true});
  const cache=new Map(), pending=new Map(), manifest=[], denied=[];
  // Reuse only fully recorded public responses; interrupted downloads are ignored.
  try{
    const prior=JSON.parse(await readFile(join(directory,'manifest.json'),'utf8'));
    assertOrigin(prior.publicOrigin,upstream);
    for(const entry of prior.assets){
      const key=entry.pathname+'\n'+JSON.stringify(entry.headers),body=await readFile(join(directory,hash(key)+'.body'));
      if(hash(body)!==entry.sha256)throw Error('Snapshot bytes changed');
      cache.set(key,{status:entry.status,contentType:entry.contentType,body});manifest.push(entry);
    }
  }catch(error){if(error.code!=='ENOENT')throw error;}
  const pull=async (pathname,requestHeaders={})=>{
    const allowed=['rsc','next-router-state-tree','next-router-prefetch','next-url','accept'];
    const headers=Object.fromEntries(allowed.filter(k=>typeof requestHeaders[k]==='string').map(k=>[k,requestHeaders[k]]));
    const key=pathname+'\n'+JSON.stringify(headers), id=hash(key);
    if(cache.has(key))return cache.get(key);
    if(pending.has(key))return pending.get(key);
    const promise=(async()=>{
      const bodyFile=join(directory,id+'.body'), headerFile=join(directory,id+'.headers');
      const args=['--silent','--show-error','--location','--compressed','--max-time','60','--dump-header',headerFile,'--output',bodyFile];
      for(const [name,value]of Object.entries(headers))args.push('--header',name+': '+value);
      args.push(new URL(pathname,upstream).href);
      await execute('curl',args,{maxBuffer:1024*1024});
      const raw=await readFile(headerFile,'utf8'), blocks=raw.split(/\r?\n\r?\n/).filter(v=>/^HTTP\//.test(v));
      const final=blocks.at(-1),status=Number(final.match(/^HTTP\/\S+\s+(\d+)/)?.[1]);
      const contentType=final.match(/^content-type:\s*([^\r\n]+)/im)?.[1]||'application/octet-stream';
      const body=await readFile(bodyFile);
      const result={status,contentType,body};cache.set(key,result);
      manifest.push({pathname,headers,status,contentType,sha256:hash(body),bytes:body.length});
      return result;
    })();pending.set(key,promise);
    try{return await promise;}finally{pending.delete(key);}
  };
  const server=createServer(async(req,res)=>{
    if(!['GET','HEAD'].includes(req.method)){denied.push({method:req.method,path:req.url});res.writeHead(405);res.end('Read-only preview');return;}
    try{
      const response=await pull(req.url,req.headers);
      let body=response.body;
      if(candidate&&response.contentType.includes('text/html')&&req.method==='GET'){
        const original=body.toString('utf8'),addition='<style data-hidi-catalogue-polish-preview="true">'+css+'</style>';
        if(!/<\/head>/i.test(original))throw Error('Snapshot HTML has no head');
        const updated=original.replace(/<\/head>/i,addition+'</head>');
        if(updated.replace(addition,'')!==original)throw Error('HTML differs beyond the reviewed CSS');
        body=Buffer.from(updated);
      }
      res.writeHead(response.status,{'Content-Type':response.contentType,'Cache-Control':'no-store','X-Robots-Tag':'noindex, nofollow'});
      res.end(req.method==='HEAD'?undefined:body);
    }catch(error){res.writeHead(502,{'Content-Type':'text/plain'});res.end(error.message);}
  });
  await new Promise(done=>server.listen(0,'127.0.0.1',done));
  return {server,base:'http://127.0.0.1:'+server.address().port,
    setCandidate(value){candidate=value;},pull,manifest,denied,
    async save(){await writeFile(join(directory,'manifest.json'),JSON.stringify({publicOrigin:upstream,assets:manifest,upstreamWrites:0,denied},null,2));},
    async close(){server.closeAllConnections();await new Promise(done=>server.close(done));}};
}
function assertOrigin(saved,current){if(saved!==current)throw Error('Snapshot public origin differs');}
