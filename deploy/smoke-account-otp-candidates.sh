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
cleanup() { docker rm -f account-otp-candidate-check >/dev/null 2>&1 || true; }
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
const pw=await import(pathToFileURL(process.env.HIDI_PLAYWRIGHT_MODULE).href);
const base='http://127.0.0.1:3192';
const admin=await fetch(base+'/api/admin/dashboard/overview');
assert([401,403].includes(admin.status),'Retained admin authentication boundary is missing');
const report=[];
for(const engine of ['chromium','firefox','webkit']) {
  const browser=await pw[engine].launch({headless:true});
  const context=await browser.newContext({viewport:{width:390,height:844}});
  try {
    await context.route('**/*',route=>new URL(route.request().url()).origin===base && ['GET','HEAD'].includes(route.request().method()) ? route.continue() : route.abort());
    const page=await context.newPage(),errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    const home=await page.goto(base+'/');assert(home?.ok(),'Retained homepage runtime did not start');
    const policy=await page.goto(base+'/account/policy');assert(policy?.ok(),'Combined runtime does not forward the new account policy route');
    await page.getByRole('heading',{name:'Account terms & privacy notice',exact:true}).waitFor();
    assert.equal(await page.locator('#terms').count(),1);assert.equal(await page.locator('#privacy').count(),1);
    assert.deepEqual(errors,[],'Policy or retained homepage has browser runtime errors');
    await page.screenshot({path:'evidence/'+engine+'-candidate-account-policy.png',fullPage:true});
    report.push({engine,passed:true,retainedHomepage:true,accountPolicy:true,adminProtected:true,providerRequestsSent:0});
  } finally {await context.close();await browser.close();}
}
await writeFile('evidence/candidate-account-packaging.json',JSON.stringify(report,null,2));
console.log('PASS: composed runtime, policy route and OTP fixtures in all three engines; no provider OTPs sent');
NODE
docker logs account-otp-candidate-check > "$work/candidate-web.log" 2>&1
