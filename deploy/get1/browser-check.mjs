import assert from 'node:assert/strict';
import {readFile,writeFile,unlink} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

// Execute all suites against the extracted production candidate. Fixtures and
// their private offer store exist only on localhost; no production writes.
const path=new URL('../checkout-offers/get1-candidate-temp.mjs',import.meta.url);
let source=await readFile(new URL('../checkout-offers/candidate.mjs',import.meta.url),'utf8');
const marker="  const purchase=await import('../purchase-actions/probes.mjs');";
assert.equal(source.split(marker).length,2);
const additions=`
  await (await import('../coupon-copy/browser.mjs')).probe(base,{setSubtotal:value=>fixtureSubtotal=value});
  const {initialState}=await import('../offers/model.mjs');
  const {independentState,changeCampaign}=await import('../offers/campaigns.mjs');
  const resetIndependent=()=>{
    const old=initialState(),time=new Date().toISOString(),actor={id:'fixture-owner'},revision={id:'fixture-initial',actor,time};
    old.draft={...old.draft,welcomeEnabled:true,dressEnabled:false,checkoutEnabled:true,audience:'EVERYONE',terms:'WELCOME250 terms'};
    old.published={...revision,version:4,config:old.draft,publishedAt:time};
    state=independentState(old);
    state=changeCampaign(state,{action:'save',offerCode:'GET1',draft:{...state.offers.GET1.draft,checkoutEnabled:true,landingEnabled:false,audience:'EVERYONE',eligibleProductIds:products.slice(2,13).map(p=>p.id)}},revision);
    etag='"offer-'+(++offerWrites)+'"';
  };
  await (await import('../get1/probe.mjs')).probe({base,reset:resetIndependent,setSubtotal:value=>fixtureSubtotal=value,state:()=>structuredClone(state)},{output:'evidence/get1',actualRuntime:true});
`;
// Match the real public catalogue contract: active products omit status.
source=source.replace("send(200,products);}","send(200,products.map(({status,...product})=>product));}");
source=source.replace(marker,additions+marker);
await writeFile(path,source);
try{
  const result=spawnSync(process.execPath,[fileURLToPath(path)],{stdio:'inherit'});
  assert.equal(result.status,0,'Production-runtime GET1 regression failed');
}finally{await unlink(path);}
