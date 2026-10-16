#!/usr/bin/env bash
# Packaging checks against ephemeral candidate containers and a local mock API. No live credentials or OTP sends.
set -Eeuo pipefail
api=${1:?Candidate API digest required}
web=${2:?Candidate web digest required}
work=${RUNNER_TEMP:?RUNNER_TEMP required}/sms-private
mkdir -p "$work"
docker run --rm --entrypoint node \
  -e NODE_ENV=production -e HIDI_AUTH_SECRET=local-candidate-test-secret-never-used-live-123456 \
  -e CUSTOMER_OTP_PROVIDER=msg91 -e CUSTOMER_OTP_FALLBACK_PROVIDER=firebase \
  -e FIREBASE_PROJECT_ID=candidate-test-project \
  "$api" --input-type=module -e '
    import assert from "node:assert/strict";
    import {SupabaseAuthService} from "/app/apps/api/dist/auth/supabase-auth.service.js";
    assert.deepEqual(new SupabaseAuthService().authConfig(), {phoneOtp:true,channel:"SMS",provider:"msg91",fallbackProvider:"firebase"});
    console.log("PASS: composed API imports and exposes MSG91 with Firebase fallback");'
node --input-type=module <<'NODE' > "$work/mock-api.log" 2>&1 &
import {createServer} from 'node:http';
createServer((request,response)=>{
  const path=new URL(request.url,'http://127.0.0.1').pathname;
  response.setHeader('Content-Type','application/json');
  if(path.endsWith('/auth/config')) return response.end(JSON.stringify({phoneOtp:true,channel:'SMS',provider:'msg91',fallbackProvider:'firebase'}));
  if(path.includes('/auth/otp/')) {response.statusCode=500;return response.end(JSON.stringify({message:'OTP sends are prohibited in packaging checks'}));}
  if(path.includes('/admin/')) {response.statusCode=401;return response.end(JSON.stringify({message:'Authentication required'}));}
  response.end(JSON.stringify(path.endsWith('/health')?{status:'ok'}:[]));
}).listen(3193,'127.0.0.1');
NODE
mock_pid=$!
cleanup() { docker rm -f msg91-candidate-check >/dev/null 2>&1 || true; kill "$mock_pid" 2>/dev/null || true; }
trap cleanup EXIT
docker run --detach --name msg91-candidate-check --network host \
  -e PORT=3192 -e STOREFRONT_ORIGIN= -e STOREFRONT_SERVER_PATH=/app/apps/web/server.js \
  -e API_URL=http://127.0.0.1:3193/v1 -e INTERNAL_API_URL=http://127.0.0.1:3193/v1 "$web" >/dev/null
for attempt in $(seq 1 60); do
  curl -fsS --max-time 5 http://127.0.0.1:3192/health >/dev/null 2>&1 && break
  sleep 1
done
started=false
for attempt in $(seq 1 60); do
  if curl -fsS --max-time 5 http://127.0.0.1:3192/account >/dev/null 2>&1; then started=true; break; fi
  sleep 1
done
$started || { echo 'Composed Next account route did not become ready' >&2; exit 1; }
node --input-type=module <<'NODE'
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {mkdir,writeFile} from 'node:fs/promises';
const {chromium}=await import(pathToFileURL(process.env.HIDI_PLAYWRIGHT_MODULE).href);
const browser=await chromium.launch({headless:true});
const context=await browser.newContext();
try {
  await context.route('**/*',route=>{
    const url=new URL(route.request().url());
    if(url.hostname==='127.0.0.1'||url.hostname==='localhost'||url.protocol==='data:') return route.continue();
    return route.abort();
  });
  const page=await context.newPage(); const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  const base='http://127.0.0.1:3192';
  const home=await page.goto(base+'/'); assert(home?.ok(),'Retained homepage runtime did not start');
  const account=await page.goto(base+'/account'); assert(account?.ok(),'Composed Next account route did not start');
  await page.getByRole('heading',{name:'Your HIDI account.',exact:true}).waitFor({timeout:30000});
  await page.getByRole('button',{name:'Send SMS OTP',exact:true}).waitFor({timeout:30000});
  assert.deepEqual(errors,[],'Candidate account has browser runtime errors');
  const config=await context.request.get(base+'/api/store/auth/config');
  assert(config.ok()); assert.deepEqual(await config.json(),{phoneOtp:true,channel:'SMS',provider:'msg91',fallbackProvider:'firebase'});
  const admin=await context.request.get(base+'/api/admin/dashboard/overview',{headers:{Cookie:'hidi_admin_access=invalid-candidate-probe'}});
  assert([401,403].includes(admin.status()),'Candidate lost the admin authentication boundary');
  await mkdir('evidence',{recursive:true});
  await page.screenshot({path:'evidence/candidate-account.png',fullPage:true});
  await writeFile('evidence/candidate-packaging.json',JSON.stringify({passed:true,retainedRuntimeStarted:true,accountUiHydrated:true,msg91Config:true,adminProtected:true,otpRequestsSent:0},null,2));
  console.log('PASS: candidate retained runtime, Next account UI, SMS configuration, admin boundary; no OTP sent');
} finally {await context.close();await browser.close();}
NODE
docker logs msg91-candidate-check > "$work/candidate-web.log" 2>&1
