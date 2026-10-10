// Run the actual retained Next server with local API and Blob fixtures only.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
const root = process.env.HIDI_CANDIDATE_RUNTIME;
assert.ok(root, "Candidate application root required");
const max = 12 * 1024 * 1024;
const calls = [];
const collectionCalls = [];
const blobs = [];
const upstream = createServer(async (request, response) => {
  const send = (data, status = 200) => {
    response.writeHead(status, {"content-type": "application/json"});
    response.end(JSON.stringify(data));
  };
  if (request.url.startsWith("/fixture-msi/token")) {
    return send({access_token:"fixture-managed-identity-token", token_type:"Bearer",
      expires_on:String(Math.floor(Date.now()/1000)+3600), resource:"https://storage.azure.com"});
  }
  if (request.url.startsWith("/fixture-blob/")) {
    let size=0; for await (const chunk of request) size+=chunk.length;
    assert.equal(request.headers["if-none-match"],"*","Blob overwrite guard retained");
    blobs.push({size,type:request.headers["x-ms-blob-content-type"]});
    response.writeHead(201,{etag:'"fixture-etag"',"x-ms-request-id":"fixture-request", "x-ms-version":"2025-11-05"});
    response.end();return;
  }
  if (request.url.startsWith("/v1/products")) {
    collectionCalls.push(new URL(request.url,"http://fixture.invalid").searchParams.get("category"));
    return send([]);
  }
  if (request.headers.authorization !== "Bearer fixture-photo-admin") return send({message:"Admin session expired"}, 401);
  let raw = "";
  for await (const chunk of request) raw += chunk;
  const body = raw ? JSON.parse(raw) : {};
  calls.push({url:request.url, method:request.method, body});
  if (request.url.endsWith("/images/ticket")) {
    if (body.sizeBytes > max) return send({message:"Image must be no larger than 12 MB"}, 400);
    return send({token:"fixture-only-ticket"});
  }
  if (request.url.endsWith("/images")) return send({id:"fixture-photo", ...body});
  return send({items:[], total:0, categories:[], collections:[], variants:[], suppliers:[]});
});
await new Promise(resolve => upstream.listen(0,"127.0.0.1",resolve));
const reserve = createServer();
await new Promise(resolve => reserve.listen(0,"127.0.0.1",resolve));
const port = reserve.address().port;
await new Promise(resolve => reserve.close(resolve));
const child = spawn(process.execPath, ["--require", path.resolve("tests/fixtures/photo-upload-preload.cjs"),
  path.join(root,"apps/web/server.js")], {
  cwd:path.join(root,"apps/web"),
  env:{...process.env, NODE_ENV:"production", PORT:String(port), HOSTNAME:"127.0.0.1",
    API_URL:"http://127.0.0.1:"+upstream.address().port+"/v1",
    INTERNAL_API_URL:"http://127.0.0.1:"+upstream.address().port+"/v1",
    MEDIA_STORAGE_PROVIDER:"azure", AZURE_STORAGE_ACCOUNT:"fixtureaccount",
    MEDIA_PUBLIC_BASE_URL:"https://fixture.invalid/media", ALLOW_PUBLIC_DOMAIN:"true",
    IDENTITY_ENDPOINT:"http://127.0.0.1:"+upstream.address().port+"/fixture-msi/token",
    IDENTITY_HEADER:"fixture-only-identity-header", HIDI_PHOTO_FIXTURE_PORT:String(upstream.address().port)},
  stdio:["ignore","pipe","pipe"],
});
let log = "";
child.stdout.on("data", bytes => log += bytes);
child.stderr.on("data", bytes => log += bytes);
const base = "http://127.0.0.1:"+port;
const results = [];
async function photo(size, type = "image/jpeg", cookie = "fixture-photo-admin") {
  const form = new FormData();
  form.set("file", new File([new Uint8Array(size)], "12345_001_main.webp", {type}));
  form.set("applyToColor","true");
  form.set("isMain",String(size===max && type==="image/webp"));
  return fetch(base+"/api/admin/inventory/fixture_variant/images", {
    method:"POST", headers:cookie ? {cookie:"hidi_admin_access="+cookie} : {}, body:form,
    signal:AbortSignal.timeout(60000),
  });
}
try {
  let ready = false;
  for (let attempt=0; attempt<120; attempt++) {
    try { const response=await fetch(base+"/api/admin/inventory/fixture_variant/images",{method:"POST",signal:AbortSignal.timeout(2000)});
      if(response.status===401){ready=true;break;} } catch {}
    if(child.exitCode!==null)throw new Error("Candidate exited: "+log.slice(-1600));
    await new Promise(resolve => setTimeout(resolve,250));
  }
  assert.ok(ready,"Actual Next candidate failed to start: "+log.slice(-1600));
  for (const [size,type] of [[5*1024*1024+1,"image/jpeg"],[8*1024*1024+1,"image/jpeg"],
    [10*1024*1024+1,"image/jpeg"],[max,"image/jpeg"],[max,"image/png"],
    [max,"image/webp"],[max,"image/avif"]]) {
    const before=calls.length;
    const response=await photo(size,type);
    assert.equal(response.status,200,await response.text());
    assert.equal(calls.length,before+2,"Exactly one ticket and attachment per photo");
    assert.equal(calls[before].body.sizeBytes,size,"Entire multipart file reached the ticket request");
    assert.equal(calls[before].body.mimeType,type);
    assert.match(calls[before+1].body.storagePath,/^azure:\/\/product-media\/products\/variants\//);
    assert.equal(blobs.at(-1).size,size,"Azure SDK transmitted every photo byte to the local fixture");
    assert.equal(blobs.at(-1).type,type);
    assert.equal(calls[before+1].body.applyToColor,true,"Photo reaches every size in the chosen colour");
    assert.equal(calls[before+1].body.isMain,size===max && type==="image/webp","Main photo marker crosses the actual Next BFF");
    results.push({name:type+" "+size+" bytes",status:"PASS"});
  }
  for (const [size,type] of [[max+1,"image/jpeg"],[13*1024*1024,"image/jpeg"],[0,"image/jpeg"],
    [1,"image/gif"],[1,"application/pdf"],[1,"image/svg+xml"]]) {
    const before=calls.length;
    const beforeBlobs=blobs.length;
    const response=await photo(size,type);
    assert.equal(response.status,400,await response.text());
    assert.equal(calls.length,before,"Rejected photo must not obtain a ticket or metadata write");
    assert.equal(blobs.length,beforeBlobs);
    results.push({name:"reject "+type+" "+size+" bytes",status:"PASS"});
  }
  const before=calls.length;
  assert.equal((await photo(max,"image/jpeg",null)).status,401);
  assert.equal(calls.length,before);
  const invalid=await photo(max,"image/jpeg","expired-fixture-token");
  assert.equal(invalid.status,502,"Existing ticket-denial behavior retained");
  assert.equal(calls.length,before,"Unverified token must not reach authorized API handlers");
  results.push({name:"anonymous and expired access denied",status:"PASS"});
  for (const [slug,title] of [["casual-wear","Casual Wear"],["work-wear","Work Wear"],
    ["occasional-wear","Occasional Wear"],["ananyas-pick","Ananya’s Pick"],
    ["everyday","Everyday"],["work-edit","Workwear Edit"],["occasion","Occasion"]]) {
    const before=collectionCalls.length;
    const response=await fetch(base+"/collections/"+slug,{signal:AbortSignal.timeout(20000)});
    assert.equal(response.status,200);
    const html=await response.text();
    assert.ok(html.includes("<h1>"+title+"</h1>"),"Correct collection heading: "+slug);
    assert.equal(collectionCalls.length,before+1,"One filtered catalogue read per view");
    assert.equal(collectionCalls.at(-1),slug,"Collection route sends the exact filter, without all-products fallback");
    results.push({name:"collection "+slug,status:"PASS"});
  }
  const beforeUnknown=collectionCalls.length;
  assert.equal((await fetch(base+"/collections/unknown-skn-collection")).status,404);
  assert.equal(collectionCalls.length,beforeUnknown);
  results.push({name:"unknown collection stays 404",status:"PASS"});
  const config=JSON.parse(await readFile(path.join(root,"apps/web/.next/required-server-files.json"),"utf8"));
  assert.equal(config.config.experimental.proxyClientMaxBodySize,14*1024*1024);
  const report={passed:true, checks:results.length, actualNextHttp:true, categories:true, mainPhoto:true, photoLimitBytes:max,
    requestBodyBytes:14*1024*1024, results, productionDatabaseWrites:0, productionBlobWrites:0};
  await mkdir("evidence/product-skn",{recursive:true});
  await writeFile("evidence/product-skn/candidate-http.json",JSON.stringify(report,null,2));
  console.log(JSON.stringify(report));
} finally {
  if (child.exitCode===null) {
    child.kill("SIGTERM");
    await new Promise(resolve=>child.once("exit",resolve));
  }
  upstream.closeAllConnections(); upstream.close();
}

