import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
const result=spawnSync(process.execPath,['deploy/performance/performance.browser.mjs'],{stdio:'inherit',env:{...process.env,HIDI_PERF_BASE:'https://thidigk.thehidi.com',HIDI_PERF_LIVE:'1',HIDI_PERF_ENGINES:'chromium'}});
assert.equal(result.status,0,'Live UI verification failed');
const evidence=[];
for(const host of ['thidigk.thehidi.com','thehidi.com','www.thehidi.com','hidiindia.com','www.hidiindia.com']) {
  for(const path of ['/','/collections/all','/api/hidi/analytics-config']) {
    try {
      const response=await fetch('https://'+host+path,{redirect:'follow',signal:AbortSignal.timeout(20000)});
      const row={host,path,status:response.status,finalUrl:response.url,server:response.headers.get('server'),cfRay:response.headers.get('cf-ray'),cfCacheStatus:response.headers.get('cf-cache-status'),cacheControl:response.headers.get('cache-control'),encoding:response.headers.get('content-encoding'),timing:response.headers.get('server-timing'),age:response.headers.get('age')};
      const text=await response.text();row.privateLanding=text.includes('HIDI is temporarily private');
      if(path.includes('analytics-config')&&response.ok) {
        try {row.analytics=JSON.parse(text);} catch {row.analyticsUnavailable=true;}
      }
      evidence.push(row);
    } catch(error) {evidence.push({host,path,error:error.cause?.code||error.name});}
  }
}
await writeFile('evidence/domains-and-edge.json',JSON.stringify(evidence,null,2));console.log('PASS: production/test-domain, analytics and edge evidence recorded');
