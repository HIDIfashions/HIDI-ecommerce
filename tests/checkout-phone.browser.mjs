/** Real production-built checkout UI; local synthetic API only. Never sends SMS, signs in, creates orders or pays. */
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
const pw = await import(process.env.HIDI_PLAYWRIGHT_MODULE ? pathToFileURL(process.env.HIDI_PLAYWRIGHT_MODULE).href : "playwright");
const out = resolve("test-results/checkout-phone"); await mkdir(out, {recursive:true});
const port = 3123, apiPort = 4123, base = `http://127.0.0.1:${port}`;
const sessionId = "11111111-2222-4333-8444-555555555555";
const phone = "+919876543210"; // synthetic only; never sent to MSG91
const delay = ms => new Promise(r => setTimeout(r,ms));
let state, next, activeBrowser, currentPage, log = "";
const results = [], requests = [];
const reset = () => state = { required:true,available:true,mode:"ok",challenge:null,proof:null,sendCount:0,verifyCount:0,prepareCount:0,delayVerify:false };
const cart = { itemCount:2,subtotalPaise:298000,items:[{
  id:"synthetic-line",quantity:2,lineTotalPaise:298000,
  product:{id:"synthetic-product",name:"Synthetic sand kurta set",slug:"sana-sand-kurta-set",image:null},
  variant:{id:"synthetic-variant",size:"XL",color:"Sand",pricePaise:149000}
}] };
const upstream=createServer(async(req,res)=>{
  const url=new URL(req.url,`http://127.0.0.1:${apiPort}`),p=url.pathname.replace(/^\/v1/,"");
  const send=(code,data)=>{res.writeHead(code,{"content-type":"application/json","cache-control":"no-store"});res.end(JSON.stringify(data));};
  try{
    let raw="";for await(const chunk of req)raw+=chunk;
    const body=raw?JSON.parse(raw):{};
    requests.push({method:req.method,path:p}); // No phone/OTP/token in artifact logs.
    if(p.startsWith("/carts/")&&req.method==="GET") return send(200,cart);
    if(p==="/checkout/phone/policy")return send(state.mode==="policy-error"?503:200,{required:state.required,available:state.available});
    if(p==="/checkout/phone/send"){
      state.sendCount++; assert.equal(body.sessionId,sessionId);assert.match(body.phone,/^\+91[6-9][0-9]{9}$/);
      if(state.mode==="send-error")return send(503,{message:"We could not send the verification code. Please try again later."});
      state.challenge={id:randomUUID(),phone:body.phone};
      return send(200,{challengeId:state.challenge.id,maskedPhone:"+91 ••••••3210",expiresAt:new Date(Date.now()+300000).toISOString(),resendAt:new Date(Date.now()+60000).toISOString()});
    }
    if(p==="/checkout/phone/verify"){
      state.verifyCount++;
      if(state.delayVerify)await delay(500);
      if(state.mode==="malformed")return send(200,{verified:true});
      if(!state.challenge||body.challengeId!==state.challenge.id||body.phone!==state.challenge.phone||body.otp!=="123456")return send(400,{message:"That code is invalid or has expired."});
      state.proof={verified:true,phone:body.phone,token:state.challenge.id+"."+"a".repeat(43),expiresAt:new Date(Date.now()+900000).toISOString()};
      return send(200,state.proof);
    }
    if(p==="/checkout/prepare"){
      state.prepareCount++;
      if(state.required&&(!state.proof||body.phoneVerificationToken!==state.proof.token||body.customerPhone!==state.proof.phone))return send(401,{message:"Verify your mobile number."});
      assert.equal(body.shippingAddress.phone,body.customerPhone);
      assert.equal(req.headers.authorization,undefined,"Guest must remain accountless");
      return send(503,{message:"Synthetic test stopped after verified prepare; no payment or order created."});
    }
    if(p.startsWith("/checkout/delivery-serviceability"))return send(200,{serviceable:true,city:"Hyderabad",state:"Telangana"});
    if(p.startsWith("/products"))return send(200,[]);
    if(p.startsWith("/health"))return send(200,{ok:true});
    return send(404,{message:"No synthetic fixture"});
  }catch{send(500,{message:"Synthetic fixture failed"});}
});
async function until(check,label,timeout=12000){
  const start=Date.now();while(!(await check())){if(Date.now()-start>timeout)throw Error(`Timed out: ${label}`);await delay(40);}
}
async function scenario(browser,engine,name,work,width=390){
  reset();
  const context=await browser.newContext({viewport:{width,height:1000},reducedMotion:"reduce"});
  await context.addInitScript(({sessionId})=>{
    localStorage.setItem("hidi_cart_session",sessionId);
    window.Razorpay=class{open(){} close(){} on(){}};
  },{sessionId});
  await context.route("**/*",route=>{
    const request=route.request(),url=new URL(request.url());
    if(url.hostname==="127.0.0.1")return route.continue();
    // Empty local stand-in instead of fetching Razorpay or any analytics/provider asset.
    if(request.resourceType()==="script")return route.fulfill({status:200,contentType:"application/javascript",body:""});
    return route.abort();
  });
  const page=await context.newPage();currentPage=page;const errors=[];
  page.on("pageerror",error=>errors.push(error.message));
  try{
    await page.goto(`${base}/checkout`,{waitUntil:"domcontentloaded"});
    await page.locator("#checkout-phone").waitFor();
    await until(()=>page.locator('input[name="email"]').count().then(n=>n===1),"checkout rendered");
    await work(page,context);
    assert.deepEqual(errors,[],"Uncaught browser errors");
    results.push({engine,name,width,passed:true});console.log(`PASS ${engine}: ${name} (${width}px)`);
  }catch(error){
    results.push({engine,name,width,passed:false,error:String(error)});
    await page.screenshot({path:resolve(out,`${engine}-${name}-failure.png`),fullPage:true}).catch(()=>{});
    throw error;
  }finally{await context.close();currentPage=null;}
}
const phoneField=page=>page.locator("#checkout-phone");
const pay=page=>page.locator('button.checkout-pay-button');
const code=page=>page.locator("#checkout-phone-otp");
const verifyNumber=page=>page.getByRole("button",{name:"Verify number",exact:true});
const verifyCode=page=>page.getByRole("button",{name:"Verify code",exact:true});
async function start(page){
  await phoneField(page).fill("9876543210");
  await verifyNumber(page).waitFor();
  await verifyNumber(page).click();
  await code(page).waitFor();
}
async function verify(page){await code(page).fill("123456");await verifyCode(page).click();await until(()=>phoneField(page).getAttribute("readonly").then(v=>v!==null),"verified number");}
async function fillAddress(page){
  for(const [name,value]of Object.entries({email:"synthetic@example.test",firstName:"Test",line1:"Synthetic address",postalCode:"500001",city:"Hyderabad",state:"Telangana"})){
    await page.locator(`input[name="${name}"]`).fill(value);
  }
}
try{
  reset();await new Promise((done,reject)=>{upstream.once("error",reject);upstream.listen(apiPort,"127.0.0.1",done);});
  next=spawn(process.execPath,[resolve("apps/web/node_modules/next/dist/bin/next"),"start","-H","127.0.0.1","-p",String(port)],{
    cwd:resolve("apps/web"),env:{...process.env,NODE_ENV:"production",API_URL:`http://127.0.0.1:${apiPort}/v1`,INTERNAL_API_URL:`http://127.0.0.1:${apiPort}/v1`},stdio:["ignore","pipe","pipe"]});
  next.stdout.on("data",b=>log+=b);next.stderr.on("data",b=>log+=b);
  await until(async()=>{try{return(await fetch(`${base}/healthz`)).ok;}catch{return false;}},"Next server",60000);
  for(const engine of (process.env.HIDI_BROWSER_ENGINES||"chromium").split(",")){
    const browser=await pw[engine].launch({headless:true});activeBrowser=browser;
    for(const width of [320,390,768,1440]){
      await scenario(browser,engine,`compact-${width}`,async page=>{
        assert.equal(await phoneField(page).getAttribute("maxlength"),"10");
        await phoneField(page).fill("987654321");assert.equal(await verifyNumber(page).count(),0);
        await phoneField(page).press("0");await verifyNumber(page).waitFor();
        await phoneField(page).press("1");assert.equal(await phoneField(page).inputValue(),"9876543210");
        assert.equal(state.sendCount,0,"Typing must not send SMS");assert(await pay(page).isDisabled());
        const measure=await phoneField(page).evaluate(el=>({
          phoneWidth:el.parentElement.getBoundingClientRect().width,
          fontSize:parseFloat(getComputedStyle(el).fontSize),
          overflow:document.documentElement.scrollWidth-document.documentElement.clientWidth
        }));
        assert(measure.phoneWidth<=254&&measure.phoneWidth>190,JSON.stringify(measure));
        assert(measure.fontSize>=16);assert(measure.overflow<=1,JSON.stringify(measure));
        await page.screenshot({path:resolve(out,`${engine}-phone-${width}.png`),fullPage:true});
      },width);
    }
    await scenario(browser,engine,"verify-guest",async(page,context)=>{
      await fillAddress(page);
      // Pasting a formatted international phone keeps just the ten local digits.
      await phoneField(page).evaluate(el=>{const e=new Event("paste",{bubbles:true,cancelable:true});Object.defineProperty(e,"clipboardData",{value:{getData:()=>"+91 98765 43210"}});el.dispatchEvent(e);});
      await verifyNumber(page).waitFor();assert.equal(await phoneField(page).inputValue(),"9876543210");
      await page.locator(".checkout-form").evaluate(form=>form.dispatchEvent(new Event("submit",{bubbles:true,cancelable:true})));
      await delay(100);assert.equal(state.prepareCount,0,"Invoked submit cannot bypass UI gate");
      await verifyNumber(page).click();await code(page).waitFor();
      assert.equal(state.sendCount,1);assert(await pay(page).isDisabled());
      await code(page).fill("654321");await verifyCode(page).click();
      await page.getByRole("alert").filter({hasText:"invalid or has expired"}).waitFor();assert(await pay(page).isDisabled());
      await verify(page);assert.equal(state.verifyCount,2);assert.equal(await pay(page).isDisabled(),false);
      assert.equal(await page.evaluate(()=>localStorage.getItem("hidi_supabase_session")),null);
      const cookies=await context.cookies();assert(!cookies.some(c=>/session|auth|otp/i.test(c.name)));
      await page.screenshot({path:resolve(out,`${engine}-verified-guest.png`),fullPage:true});
      await pay(page).click();
      await page.getByRole("alert").filter({hasText:"Synthetic test stopped"}).waitFor();
      assert.equal(state.prepareCount,1);
      await page.getByRole("button",{name:"Change number",exact:true}).click();
      assert(await pay(page).isDisabled());assert.equal(await phoneField(page).getAttribute("readonly"),null);
      await phoneField(page).fill("9876543211");assert.equal(state.sendCount,1);
    },1440);
    await scenario(browser,engine,"cooldown-expiry",async page=>{
      await page.clock.install();
      await start(page);assert.equal(state.sendCount,1);
      assert(await page.getByRole("button",{name:/Resend in/}).isDisabled());
      await page.clock.fastForward(301000);
      await until(()=>verifyCode(page).isDisabled(),"expired code disabled");
      await page.getByText("This code has expired. Request a new code.",{exact:true}).waitFor();
      assert(await pay(page).isDisabled());
      await page.getByRole("button",{name:"Resend code",exact:true}).click();
      await until(()=>state.sendCount===2,"explicit resend");
    });
    await scenario(browser,engine,"late-success-after-edit",async page=>{
      await start(page);state.delayVerify=true;
      await code(page).fill("123456");await verifyCode(page).click();
      await phoneField(page).fill("9876543211");
      await delay(700);
      assert.equal(await phoneField(page).getAttribute("readonly"),null);
      assert(await pay(page).isDisabled());assert.equal(await code(page).count(),0);
    });
    await scenario(browser,engine,"send-outage",async page=>{
      state.mode="send-error";
      await phoneField(page).fill("9876543210");await verifyNumber(page).waitFor();await verifyNumber(page).click();
      await page.getByRole("alert").filter({hasText:"could not send"}).waitFor();
      assert(await pay(page).isDisabled());assert.equal(await code(page).count(),0);
      assert(await page.getByRole("button",{name:/Retry in/}).isDisabled());
    });
    await scenario(browser,engine,"malformed-success",async page=>{
      await start(page);state.mode="malformed";
      await code(page).fill("123456");await verifyCode(page).click();
      await page.getByRole("alert").filter({hasText:"could not be verified"}).waitFor();
      assert(await pay(page).isDisabled());
    });
    await scenario(browser,engine,"rollout-off",async page=>{
      state.required=false;
      // Refresh policy from fixture; no OTP is falsely advertised during staged rollout.
      await page.reload({waitUntil:"domcontentloaded"});await phoneField(page).waitFor();
      await phoneField(page).fill("9876543210");
      await until(()=>pay(page).isEnabled(),"legacy checkout preserved while explicitly off");
      assert.equal(await verifyNumber(page).count(),0);assert.equal(state.sendCount,0);
    });
    await browser.close();activeBrowser=null;
  }
  assert(!requests.some(r=>/\/auth\/|\/payments|\/orders/.test(r.path)),"No auth/order/payment API called");
  console.log(`${results.length} checkout phone browser scenarios passed with synthetic data. Live SMS and Azure SQL not tested.`);
}finally{
  await currentPage?.screenshot({path:resolve(out,"last-failure.png"),fullPage:true}).catch(()=>{});
  await activeBrowser?.close().catch(()=>{});
  next?.kill("SIGTERM");
  upstream.closeAllConnections?.();await new Promise(done=>upstream.close(done));
  await writeFile(resolve(out,"results.json"),JSON.stringify({results,requests,scope:"production-built UI / isolated API only; no live OTP or payment"},null,2));
  await writeFile(resolve(out,"server.log"),log);
}
