/** Verify compiled auth and actual retained browser runtime using disposable fixtures. */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile, writeFile, unlink } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
const runtime = resolve(process.env.RUNNER_TEMP, 'hidi-admin-email-private/api/candidate-app');
for (const name of ['admin-email-otp', 'admin-rbac']) {
  const source = (await readFile('tests/' + name + '.test.ts', 'utf8')).replaceAll('../apps/api/src/', runtime + '/apps/api/dist/');
  const file = resolve('tests/' + name + '-candidate.test.ts');
  try { await writeFile(file, source); execFileSync(process.execPath, ['--import','tsx','--test','../../tests/' + name + '-candidate.test.ts'], {cwd:resolve('apps/api'),stdio:'inherit'}); }
  finally {await unlink(file).catch(()=>{});}
}
const require = createRequire(resolve(runtime, 'apps/api/package.json'));
require('reflect-metadata');
const { Module, Global } = require('@nestjs/common');
const { NestFactory } = require('@nestjs/core');
const { FastifyAdapter } = require('@nestjs/platform-fastify');
const load = path => import(pathToFileURL(resolve(runtime, 'apps/api/dist', path)));
const { AdminSecurityModule } = await load('admin/admin-security.module.js');
const { PrismaService } = await load('prisma/prisma.service.js');
const { SupabaseAuthService } = await load('auth/supabase-auth.service.js');
let providerCalls = 0;
const oldFetch = globalThis.fetch;
process.env.SUPABASE_URL = 'https://disposable-email.example.test';
process.env.SUPABASE_PUBLISHABLE_KEY = 'fixture-public-key';
const staff = {email:'fixture-owner@example.test',active:true,role:'OWNER'};
const db = {adminStaff:{findFirst:async args=>args.where.email===staff.email?staff:null}};
class Fixtures {}
Global()(Fixtures); Module({providers:[{provide:PrismaService,useValue:db},{provide:SupabaseAuthService,useValue:{}}],exports:[PrismaService,SupabaseAuthService]})(Fixtures);
class Root {}
Module({imports:[Fixtures,AdminSecurityModule]})(Root);
const app = await NestFactory.create(Root,new FastifyAdapter(),{logger:false});
try {
  app.setGlobalPrefix('v1'); await app.init(); await app.getHttpAdapter().getInstance().ready();
  globalThis.fetch = async (_url,options)=>{providerCalls++;assert.deepEqual(JSON.parse(options.body),{email:staff.email,create_user:false});return new Response('{}',{status:200});};
  const inject = payload=>app.getHttpAdapter().getInstance().inject({method:'POST',url:'/v1/auth/admin/otp/request',payload});
  assert.equal((await inject({email:'unlisted@example.test'})).statusCode,403);assert.equal(providerCalls,0);
  assert.equal((await inject({email:staff.email,role:'OWNER'})).statusCode,400);assert.equal(providerCalls,0);
  assert.equal((await inject({email:staff.email})).statusCode,200);assert.equal(providerCalls,1);
  staff.active=false;assert.equal((await inject({email:staff.email})).statusCode,403);assert.equal(providerCalls,1);
  console.log('PASS actual compiled module route: deny unknown/extra/disabled; allow existing Owner without signup');
} finally {globalThis.fetch=oldFetch;await app.close();}
// Launch the actual candidate image. Browser calls are fulfilled locally and
// all external requests are blocked, so no real mail or commerce write occurs.
const { chromium,firefox,webkit } = await import(pathToFileURL(process.env.HIDI_PLAYWRIGHT_MODULE));
const container = 'hidi-admin-email-candidate';const port=3199;
execFileSync('docker',['run','--detach','--name',container,'--network','host','-e','PORT='+port,'-e','API_URL=http://127.0.0.1:1/v1','-e','INTERNAL_API_URL=http://127.0.0.1:1/v1',process.env.CANDIDATE_WEB],{stdio:'inherit'});
try {
  let ready=false;for(let i=0;i<60;i++){try{if((await fetch('http://127.0.0.1:'+port+'/health')).ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,1000));}assert(ready);
  for (const [name,engine] of Object.entries({chromium,firefox,webkit})) {
    const browser=await engine.launch();
    try {
      for(const eligible of [false,true]) {
        const page=await browser.newPage();const requests=[];
        await page.route('**/*',async route=>{
          const request=route.request();const url=new URL(request.url());
          if(url.origin!=='http://127.0.0.1:'+port) return route.abort();
          if(url.pathname==='/api/admin/session') return route.fulfill({status:401,contentType:'application/json',body:'{"message":"Admin access required"}'});
          if(url.pathname==='/api/store/auth/admin/otp/request'){
            requests.push(JSON.parse(request.postData()));return route.fulfill({status:eligible?200:403,contentType:'application/json',body:JSON.stringify(eligible?{email:'fixture-owner@example.test',retryAfterSeconds:60}:{message:'This email is not authorised for HIDI Admin'})});
          }
          if(request.method()!=='GET')throw new Error('Unexpected fixture write: '+url.pathname);
          return route.continue();
        });
        await page.goto('http://127.0.0.1:'+port+'/admin/sign-in');
        const button=page.getByRole('button',{name:'Send secure code'});await button.waitFor();
        await page.locator('#admin-email').fill(eligible?'fixture-owner@example.test':'unlisted@example.test');await button.click();
        if(eligible) await page.locator('#admin-otp').waitFor();
        else {await page.getByRole('alert').filter({hasText:'not authorised'}).waitFor();assert.equal(await page.locator('#admin-otp').count(),0);}
        assert.equal(requests.length,1);assert.deepEqual(Object.keys(requests[0]),['email']);await page.close();
      }
      console.log('PASS '+name+': unlisted denied before OTP screen; eligible mocked delivery advances');
    } finally {await browser.close();}
  }
} finally {execFileSync('docker',['rm','-f',container],{stdio:'inherit'});}
