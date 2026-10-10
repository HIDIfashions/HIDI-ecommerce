#!/usr/bin/env bash
# Exercise the retained combined runtime with synthetic loopback OTPs only.
set -Eeuo pipefail
api=${1:?Candidate API digest required}
web=${2:?Candidate web digest required}
work=${RUNNER_TEMP:?RUNNER_TEMP required}/account-otp-private
mkdir -p "$work" evidence
docker run --rm --entrypoint node \
  -e NODE_ENV=production -e HIDI_AUTH_SECRET=local-candidate-test-secret-never-used-live-123456 \
  -e CUSTOMER_OTP_PROVIDER=msg91 -e CUSTOMER_OTP_FALLBACK_PROVIDER=firebase \
  -e FIREBASE_PROJECT_ID=candidate-test-project \
  "$api" --input-type=module -e '
    import assert from "node:assert/strict";
    import {SupabaseAuthService} from "/app/apps/api/dist/auth/supabase-auth.service.js";
    import {withSerializableRetry} from "/app/apps/api/dist/wallet/wallet-transaction.js";
    assert.equal(typeof withSerializableRetry,"function");
    assert.deepEqual(new SupabaseAuthService().authConfig(), {phoneOtp:true,channel:"SMS",provider:"msg91",fallbackProvider:"firebase"});
    console.log("PASS: composed auth service resolves retained transaction helper and existing provider configuration");'
cleanup() {
  docker logs account-otp-candidate-check > "$work/candidate-web.log" 2>&1 || true
  docker rm -f account-otp-candidate-check >/dev/null 2>&1 || true
}
trap cleanup EXIT
docker run --detach --name account-otp-candidate-check --network host \
  -e PORT=3192 -e STOREFRONT_ORIGIN= -e STOREFRONT_SERVER_PATH=/app/apps/web/server.js \
  -e API_URL=http://127.0.0.1:4116/v1 -e INTERNAL_API_URL=http://127.0.0.1:4116/v1 "$web" >/dev/null
started=false
for attempt in $(seq 1 60); do
  if curl -fsS --max-time 5 http://127.0.0.1:3192/account >/dev/null 2>&1; then started=true; break; fi
  sleep 1
done
$started || { echo 'Composed account route did not become ready' >&2; exit 1; }
# This fixture starts its own mock API and verifies its sentinel before any OTP
# interaction. A miswired candidate fails before making a request.
HIDI_OTP_FIXTURE_BASE_URL=http://127.0.0.1:3192 HIDI_BROWSER_ENGINES=chromium,firefox,webkit \
  node tests/auth-otp-resend.browser.mjs
node --input-type=module <<'NODE'
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {writeFile} from 'node:fs/promises';
import {createServer} from 'node:http';
const pw=await import(pathToFileURL(process.env.HIDI_PLAYWRIGHT_MODULE).href);
const base='http://127.0.0.1:3192';
const delay=ms=>new Promise(done=>setTimeout(done,ms));
const fixtureNetworkStates = new WeakMap();
function trackFixtureNetwork(page) {
  let state = fixtureNetworkStates.get(page);
  if (state) return state;
  state = { pending: new Set(), startedAt: new WeakMap(), lastActivity: Date.now() };
  fixtureNetworkStates.set(page, state);
  page.on('request', request => { state.pending.add(request); state.startedAt.set(request, Date.now()); state.lastActivity = Date.now(); });
  const finished = request => { state.pending.delete(request); state.lastActivity = Date.now(); };
  page.on('requestfinished', finished);
  page.on('requestfailed', finished);
  return state;
}
function fixtureNetworkSnapshot(page) {
  const state = trackFixtureNetwork(page);
  return [...state.pending].map(request => {
    const url = new URL(request.url());
    return { url: url.origin + url.pathname, method: request.method(), type: request.resourceType(), ageMilliseconds: Date.now() - state.startedAt.get(request) };
  });
}
async function settleFixtureNetwork(page) {
  const state = trackFixtureNetwork(page), started = Date.now();
  try { await page.waitForLoadState('networkidle', { timeout: 15000 }); }
  catch (cause) { throw new Error('Fixture network did not settle: ' + JSON.stringify(fixtureNetworkSnapshot(page)), { cause }); }
  while (state.pending.size || Date.now() - Math.max(started, state.lastActivity) < 500) {
    assert(Date.now() - started < 15000, 'Fixture network did not settle: ' + JSON.stringify(fixtureNetworkSnapshot(page)));
    await delay(50);
  }
}
const unexpectedWrites=[];
function readOnlyFixture(req,res) {
  const path=new URL(req.url,'http://127.0.0.1:4116').pathname.replace(/^\/v1/,'');
  const reply=(status,body)=>{res.writeHead(status,{'content-type':'application/json'});res.end(req.method==='HEAD'?undefined:JSON.stringify(body));};
  if(!['GET','HEAD'].includes(req.method)) { unexpectedWrites.push({method:req.method,path});req.resume();return reply(405,{message:'Candidate fixture rejects writes'}); }
  if(path==='/auth/config') return reply(200,{phoneOtp:true,channel:'SMS',provider:'msg91',fallbackProvider:'firebase',fixture:'loopback-account-otp-candidate-readonly'});
  if(path.startsWith('/auth/otp/')) return reply(405,{message:'Candidate fixture rejects OTP operations'});
  if(path.startsWith('/admin/')) return reply(401,{message:'Authentication required'});
  return reply(200,path==='/health'?{status:'ok'}:[]);
}
// The OTP fixture closes its mock on completion. Keep a fresh write-rejecting
// loopback upstream alive while checking the composed runtime's read-only pages.
const upstream=createServer(readOnlyFixture);
await new Promise((done,reject)=>{upstream.once('error',reject);upstream.listen(4116,'127.0.0.1',done);});
try {
const config=await fetch(base+'/api/store/auth/config');
assert.equal(config.status,200);
assert.equal((await config.json()).fixture,'loopback-account-otp-candidate-readonly','Candidate must still use the isolated loopback upstream');
const admin=await fetch(base+'/api/admin/dashboard/overview');
assert([401,403].includes(admin.status),'Retained admin authentication boundary is missing');
const report=[];
for(const engine of ['chromium','firefox','webkit']) {
  const browser=await pw[engine].launch({headless:true});
  const context=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce'});
  const observed=[],errors=[];
  let phase='homepage';
  try {
    await context.route('**/*',route=>new URL(route.request().url()).origin===base && ['GET','HEAD'].includes(route.request().method()) ? route.continue() : route.abort());
    const observe=async()=>{
      const page=await context.newPage();observed.push(page);
      trackFixtureNetwork(page);page.on('pageerror',error=>errors.push(error.message));return page;
    };
    const homePage=await observe();
    const home=await homePage.goto(base+'/');assert(home?.ok(),'Retained homepage runtime did not start');
    await homePage.getByRole('navigation',{name:'Main navigation',exact:true}).waitFor({state:'visible',timeout:15000});
    await homePage.locator('header#site-header').waitFor({state:'visible',timeout:15000});
    await homePage.locator('main#main > section[aria-labelledby="hero-title"]').waitFor({state:'visible',timeout:15000});
    assert.match(await homePage.locator('#hero-title').textContent(),/HIDI/,'Retained landing client did not mount');
    // Policy links open a new tab. Keep the homepage alive rather than unloading
    // its independent media/configuration requests with a forced navigation.
    phase='policy';
    const policyPage=await observe();
    const policy=await policyPage.goto(base+'/account/policy');assert(policy?.ok(),'Combined runtime does not forward the new account policy route');
    await policyPage.getByRole('heading',{name:'Account terms & privacy notice',exact:true}).waitFor();
    assert.equal(await policyPage.locator('#terms').count(),1);assert.equal(await policyPage.locator('#privacy').count(),1);
    await settleFixtureNetwork(policyPage);
    await policyPage.screenshot({path:'evidence/'+engine+'-candidate-account-policy.png',fullPage:true});
    assert(await homePage.locator('main#main').isVisible(),'Retained homepage must remain mounted during policy checks');
    assert.deepEqual(errors,[],'Policy or retained homepage has browser runtime errors');
    assert.deepEqual(unexpectedWrites,[],'Read-only candidate checks attempted an upstream write');
    report.push({engine,passed:true,retainedHomepage:true,accountPolicy:true,adminProtected:true,providerRequestsSent:0});
  } catch(error) {
    const pages=[];
    for(const page of observed) pages.push({url:new URL(page.url()).origin+new URL(page.url()).pathname,pending:fixtureNetworkSnapshot(page),readiness:await page.evaluate(()=>({document:document.readyState,hero:document.querySelector('[data-hero-config-status]')?.dataset.heroConfigStatus,landing:document.querySelector('[data-landing-config-status]')?.dataset.landingConfigStatus})).catch(()=>null)});
    const diagnostic={engine,phase,pages,pageErrors:errors,unexpectedWrites};
    await writeFile('evidence/'+engine+'-candidate-readiness-failure.json',JSON.stringify(diagnostic,null,2));
    console.error('Candidate readiness failed',JSON.stringify(diagnostic));throw error;
  } finally {await context.close();await browser.close();}
}
await writeFile('evidence/candidate-account-packaging.json',JSON.stringify(report,null,2));
console.log('PASS: composed runtime, policy route and OTP fixtures in all three engines; no provider OTPs sent');
} finally {upstream.closeAllConnections();await new Promise(done=>upstream.close(done));}
NODE
