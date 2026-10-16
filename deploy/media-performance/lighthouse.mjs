import {spawn} from 'node:child_process';import {readFile,writeFile,mkdir,open} from 'node:fs/promises';import {pathToFileURL} from 'node:url';import {resolve} from 'node:path';
const mode=process.argv[2],out=resolve('evidence/media-performance/lighthouse');await mkdir(out,{recursive:true});
const pw=await import(pathToFileURL(process.env.HIDI_PLAYWRIGHT_MODULE).href),rows=[];
for(const device of ['mobile','desktop']){
 const prefix=out+'/'+mode+'-'+device,log=await open(prefix+'.log','w');
 const cli=process.env.HIDI_LIGHTHOUSE_MODULE;
 const child=spawn(process.execPath,[cli,'https://hidiindia.com/','--only-categories=performance','--output=json','--output=html','--output-path='+prefix,'--max-wait-for-load=45000','--chrome-flags=--headless --no-sandbox --disable-dev-shm-usage','--quiet',...(device==='desktop'?['--preset=desktop']:[])],{env:{...process.env,CHROME_PATH:pw.chromium.executablePath()},stdio:['ignore',log.fd,log.fd]});
 const code=await new Promise(done=>child.on('exit',done));await log.close();if(code!==0)throw Error('Lighthouse failed for '+device+'; inspect bounded log');
 const report=JSON.parse(await readFile(prefix+'.report.json','utf8'));if(report.runtimeError)throw Error(report.runtimeError.message);
 const a=report.audits;rows.push({device,score:Math.round(report.categories.performance.score*100),lcp:a['largest-contentful-paint'].numericValue,blocking:a['total-blocking-time'].numericValue,cls:a['cumulative-layout-shift'].numericValue,bytes:a['total-byte-weight'].numericValue,warnings:report.runWarnings});
}
await writeFile(out+'/'+mode+'.json',JSON.stringify(rows,null,2));
if(mode==='after'){
 const before=JSON.parse(await readFile(out+'/before.json','utf8'));
 for(const r of rows){const b=before.find(x=>x.device===r.device);if(r.bytes>b.bytes*.5)throw Error('Live transfer reduction below 50% for '+r.device);if(r.cls>.1)throw Error('Homepage layout shift above budget');if(r.lcp>Math.max(4000,b.lcp+750))throw Error('Homepage LCP regression');}
 await writeFile('evidence/media-performance/performance-comparison.json',JSON.stringify({passed:true,before,after:rows},null,2));
}
console.log(JSON.stringify({mode,results:rows}));
