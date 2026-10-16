import {spawn} from 'node:child_process';import {readFile,writeFile,mkdir,open} from 'node:fs/promises';import {pathToFileURL} from 'node:url';import {resolve} from 'node:path';
import {existsSync} from 'node:fs';
const mode=process.argv[2],out=resolve('evidence/paint-performance/lighthouse');await mkdir(out,{recursive:true});
const pw=await import(pathToFileURL(process.env.HIDI_PLAYWRIGHT_MODULE).href),rows=[];
for(const device of ['mobile','desktop']){
 const samples=[];for(let trial=1;trial<=3;trial++){
 const prefix=out+'/'+mode+'-'+device+'-'+trial,log=await open(prefix+'.log','w');
 const cli=process.env.HIDI_LIGHTHOUSE_MODULE;const chrome=existsSync('/usr/bin/google-chrome')?'/usr/bin/google-chrome':pw.chromium.executablePath();
 const child=spawn(process.execPath,[cli,process.env.HIDI_AUDIT_URL||'https://hidiindia.com/','--only-categories=performance','--output=json','--output=html','--output-path='+prefix,'--max-wait-for-load=45000','--chrome-flags=--headless --no-sandbox --disable-dev-shm-usage','--quiet',...(device==='desktop'?['--preset=desktop']:[])],{env:{...process.env,CHROME_PATH:chrome},stdio:['ignore',log.fd,log.fd]});
 const code=await new Promise(done=>child.on('exit',done));await log.close();if(code!==0)throw Error('Lighthouse failed for '+device+'; inspect bounded log');
 const report=JSON.parse(await readFile(prefix+'.report.json','utf8'));if(report.runtimeError)throw Error(report.runtimeError.message);
 const a=report.audits;samples.push({device,score:Math.round(report.categories.performance.score*100),lcp:a['largest-contentful-paint'].numericValue,blocking:a['total-blocking-time'].numericValue,cls:a['cumulative-layout-shift'].numericValue,bytes:a['total-byte-weight'].numericValue,warnings:report.runWarnings});
 }
 samples.sort((a,b)=>a.lcp-b.lcp);const score=[...samples].sort((a,b)=>a.score-b.score)[1].score;rows.push({...samples[1],score,samples});
}
await writeFile(out+'/'+mode+'.json',JSON.stringify(rows,null,2));
if(mode==='candidate'){for(const r of rows){if(r.score<93||r.device==='mobile'&&r.lcp>=2200||r.cls>.1)throw Error('Candidate lacks required performance headroom: '+JSON.stringify(r));}}
if(mode==='after'){
 const before=JSON.parse(await readFile(out+'/before.json','utf8'));
 for(const r of rows){const b=before.find(x=>x.device===r.device);if(r.bytes>b.bytes*1.05)throw Error('Live transfer regression for '+r.device);if(r.cls>.1)throw Error('Homepage layout shift above budget');if(r.device==='mobile'&&r.lcp>=2500)throw Error('Mobile median LCP must be below 2.5 seconds');if(r.score<=90)throw Error('Both device scores must exceed 90');}
 await writeFile('evidence/paint-performance/performance-comparison.json',JSON.stringify({passed:true,before,after:rows},null,2));
}
console.log(JSON.stringify({mode,results:rows}));
