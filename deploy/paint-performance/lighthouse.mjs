import {spawn} from 'node:child_process';import {readFile,writeFile,mkdir,open} from 'node:fs/promises';import {pathToFileURL} from 'node:url';import {resolve} from 'node:path';
import {existsSync} from 'node:fs';
import {summarizeTrials} from './summary.mjs';
import {externalScriptUrls,isPinnedFixtureResponse,requireHealthyAudit} from './audit-parity.mjs';
const mode=process.argv[2],out=resolve('evidence/paint-performance/lighthouse');await mkdir(out,{recursive:true});
const pw=await import(pathToFileURL(process.env.HIDI_PLAYWRIGHT_MODULE).href),rows=[],fixtureConnections=[];
const chromeFlags=['--headless','--no-sandbox','--disable-dev-shm-usage'];
if(mode==='candidate'){const url=new URL(process.env.HIDI_AUDIT_URL);if(url.href!=='https://hidiindia.com/'||!/^[A-Za-z0-9+/]{43}=$/.test(process.env.HIDI_AUDIT_SPKI||''))throw Error('Candidate requires the production identity on its pinned local HTTP/2 fixture');chromeFlags.push('--host-resolver-rules="MAP hidiindia.com 127.0.0.1:3190"','--ignore-certificate-errors-spki-list='+process.env.HIDI_AUDIT_SPKI);}
for(const device of ['mobile','desktop']){
 const samples=[];for(let trial=1;trial<=3;trial++){
 const prefix=out+'/'+mode+'-'+device+'-'+trial,log=await open(prefix+'.log','w');
 const cli=process.env.HIDI_LIGHTHOUSE_MODULE;const chrome=process.env.CHROME_PATH||(existsSync('/usr/bin/google-chrome')?'/usr/bin/google-chrome':pw.chromium.executablePath());
 const child=spawn(process.execPath,[cli,process.env.HIDI_AUDIT_URL||'https://hidiindia.com/','--only-categories=performance','--output=json','--output=html','--output-path='+prefix,'--max-wait-for-load=45000','--chrome-flags='+chromeFlags.join(' '),'--quiet',...(['candidate','after'].includes(mode)&&trial===1?['--save-assets']:[]),...(device==='desktop'?['--preset=desktop']:[])],{env:{...process.env,CHROME_PATH:chrome},stdio:['ignore',log.fd,log.fd]});
 const code=await new Promise(done=>child.on('exit',done));await log.close();if(code!==0)throw Error('Lighthouse failed for '+device+'; inspect bounded log');
 const report=JSON.parse(await readFile(prefix+'.report.json','utf8'));if(report.runtimeError)throw Error(report.runtimeError.message);
 requireHealthyAudit(report.audits['network-requests'].details.items);
 if(mode==='candidate'&&trial===1){const events=JSON.parse(await readFile(prefix+'-0.devtoolslog.json','utf8'));const response=events.find(event=>event.method==='Network.responseReceived'&&event.params.type==='Document'&&event.params.response.url==='https://hidiindia.com/')?.params.response;if(!isPinnedFixtureResponse(response))throw Error('Candidate origin must connect to 127.0.0.1:3190, never the live website');fixtureConnections.push({device,url:response.url,address:response.remoteIPAddress,port:response.remotePort});}
 const a=report.audits,protocol=a['network-requests'].details.items.find(item=>item.resourceType==='Document')?.protocol;samples.push({device,protocol,externalScripts:externalScriptUrls(a['network-requests'].details.items),networkDiagnostics:a.diagnostics.details.items[0],profile:{formFactor:report.configSettings.formFactor,throttlingMethod:report.configSettings.throttlingMethod,throttling:report.configSettings.throttling,screenEmulation:report.configSettings.screenEmulation},score:Math.round(report.categories.performance.score*100),lcp:a['largest-contentful-paint'].numericValue,blocking:a['total-blocking-time'].numericValue,cls:a['cumulative-layout-shift'].numericValue,bytes:a['total-byte-weight'].numericValue,warnings:report.runWarnings});
 }
 rows.push(summarizeTrials(samples));
}
await writeFile(out+'/'+mode+'.json',JSON.stringify(rows,null,2));
if(mode==='candidate'){
 if(fixtureConnections.length!==2)throw Error('Both candidate device connections must be verified');await writeFile('evidence/paint-performance/candidate-origin.json',JSON.stringify({passed:true,connections:fixtureConnections}));
 const before=JSON.parse(await readFile(out+'/before.json','utf8'));
 const network=JSON.parse(await readFile('evidence/paint-performance/network-fixture.json','utf8'));
 if(!network.passed||network.host!=='127.0.0.1'||network.port!==3190||network.roundTripDelayMs!==250||network.mtu!==1500||network.otherPortsDelayed!==false)throw Error('Candidate must retain the isolated delayed HTTP2 connection fixture');
 const matched=rows.every(row=>{const baseline=before.find(item=>item.device===row.device);return baseline?.samples.every(sample=>sample.protocol==='h2')&&row.samples.every(sample=>sample.protocol==='h2'&&JSON.stringify(sample.profile)===JSON.stringify(baseline.profile));});
 const scriptsMatched=rows.every(row=>{const baseline=before.find(item=>item.device===row.device);return baseline?.samples.every(sample=>JSON.stringify(sample.externalScripts)===JSON.stringify(row.externalScripts))&&row.samples.every(sample=>JSON.stringify(sample.externalScripts)===JSON.stringify(row.externalScripts));});
 if(!scriptsMatched)throw Error('Candidate and live baseline must load identical production third-party scripts');
 await writeFile('evidence/paint-performance/protocol-comparison.json',JSON.stringify({passed:matched,live:before.map(row=>({device:row.device,protocol:row.protocol})),staging:rows.map(row=>({device:row.device,protocol:row.protocol})),sameLighthouseThrottling:matched,sameProductionThirdPartyScripts:scriptsMatched,stagingRoundTripDelayMs:network.roundTripDelayMs,stagingMtu:network.mtu}));
 if(!matched)throw Error('Staging must match the observed live HTTP/2 protocol and device throttling settings');
 for(const r of rows){if(r.score<93||r.device==='mobile'&&r.lcp>=2200||r.cls>.1)throw Error('Candidate lacks required performance headroom: '+JSON.stringify(r));}
}
if(mode==='after'){
 const before=JSON.parse(await readFile(out+'/before.json','utf8'));
 for(const r of rows){const b=before.find(x=>x.device===r.device);if(r.bytes>b.bytes*1.05)throw Error('Live transfer regression for '+r.device);if(r.cls>.1)throw Error('Homepage layout shift above budget');if(r.device==='mobile'&&r.lcp>=2500)throw Error('Mobile median LCP must be below 2.5 seconds');if(r.score<=90)throw Error('Both device scores must exceed 90');}
 await writeFile('evidence/paint-performance/performance-comparison.json',JSON.stringify({passed:true,before,after:rows},null,2));
}
console.log(JSON.stringify({mode,results:rows}));
