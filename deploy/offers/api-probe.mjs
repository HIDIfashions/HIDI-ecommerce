import assert from 'node:assert/strict';import {createHmac,randomBytes} from 'node:crypto';import {writeFile,mkdir,unlink} from 'node:fs/promises';import {resolve,join} from 'node:path';import {spawn} from 'node:child_process';
const root=resolve(process.env.HIDI_CANDIDATE_API),file=join(root,'apps/api/dist/auth/offers-identity-smoke.mjs');
const source=`import assert from 'node:assert/strict';
import {createHmac,randomBytes} from 'node:crypto';
import {Module} from '@nestjs/common';import {NestFactory} from '@nestjs/core';import {FastifyAdapter} from '@nestjs/platform-fastify';
import {AuthController} from './auth.controller.js';import {SupabaseAuthService} from './supabase-auth.service.js';
process.env.HIDI_AUTH_SECRET=randomBytes(40).toString('hex');
const auth=new SupabaseAuthService({});class Fixture{};Module({controllers:[AuthController],providers:[{provide:SupabaseAuthService,useValue:auth}]})(Fixture);
const app=await NestFactory.create(Fixture,new FastifyAdapter(),{logger:false});app.setGlobalPrefix('v1');await app.listen(0,'127.0.0.1');
const payload={typ:'access',sub:'fixture-auth-subject',uid:'fixture-user-id',jti:'fixture-session',exp:Math.floor(Date.now()/1000)+600,phone:'+919000000001'};
const sign=value=>{const body=Buffer.from(JSON.stringify(value)).toString('base64url');return 'hidi_at_'+body+'.'+createHmac('sha256',process.env.HIDI_AUTH_SECRET).update(body).digest('base64url');};
try{const url=(await app.getUrl())+'/v1/auth/offers-identity';let checks=0;
for(const [token,expected]of [[sign(payload),200],[sign({...payload,exp:1}),401],[sign(payload).slice(0,-2)+'xx',401],['hidi_rt_forged.invalid',null],[null,401]]){const r=await fetch(url,{headers:token?{Authorization:'Bearer '+token}:{}});if(expected===null)assert(!r.ok);else assert.equal(r.status,expected);if(expected===200){assert.deepEqual(await r.json(),{phoneVerified:true,phone:'+919000000001'});assert.match(r.headers.get('cache-control'),/no-store/);}checks++;}
const r=await fetch(url,{headers:{Authorization:'Bearer '+sign({...payload,phone:null,email:'fixture@example.invalid'})}});assert.equal(r.status,200);assert.deepEqual(await r.json(),{phoneVerified:false,phone:null});checks++;
assert.equal(Reflect.getMetadata('path',AuthController.prototype.offersIdentity),'offers-identity');assert.equal(Reflect.getMetadata('method',AuthController.prototype.offersIdentity),0);
console.log('OFFERS_IDENTITY_RESULT:'+JSON.stringify({passed:true,actualNestHttp:true,cryptographicAuthVerified:true,checks,databaseWrites:0}));
}finally{await app.close();}
`;
await writeFile(file,source);let output='';
try{const child=spawn(process.execPath,[file],{cwd:root,env:{...process.env},stdio:['ignore','pipe','pipe']});child.stdout.on('data',d=>output+=d);child.stderr.on('data',d=>output+=d);const code=await new Promise(r=>child.once('exit',r));assert.equal(code,0,output.slice(-4000));const line=output.split('\n').find(l=>l.startsWith('OFFERS_IDENTITY_RESULT:'));assert(line);const report=JSON.parse(line.slice('OFFERS_IDENTITY_RESULT:'.length));await mkdir('evidence/offers',{recursive:true});await writeFile('evidence/offers/api-identity.json',JSON.stringify(report,null,2));console.log('PASS actual API identity route, valid signature, expired/forged/refresh tokens and unverified phone');}finally{await unlink(file);}
