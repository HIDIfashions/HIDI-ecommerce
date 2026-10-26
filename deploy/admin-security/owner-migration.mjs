// One-time interactive SQL-owner migration through the existing private job.
// Authentication tokens stay in memory inside the job. CI receives only an
// encrypted device challenge and bounded status; no persistent owner credential.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {mkdtemp,readFile,writeFile,appendFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {setTimeout as sleep} from 'node:timers/promises';
const group='rg-hidi-prod',name='job-hidi-validation';
function az(args){try{return JSON.parse(execFileSync('az',[...args,'--only-show-errors','-o','json'],{encoding:'utf8',stdio:['pipe','pipe','pipe'],maxBuffer:8*1024*1024}));}catch{throw new Error('Azure operation failed: '+args.slice(0,3).join(' '));}}
function logs(execution,container){try{return execFileSync('az',['containerapp','job','logs','show','-g',group,'-n',name,'--execution',execution,'--container',container,'--tail','100','--only-show-errors'],{encoding:'utf8',stdio:['pipe','pipe','pipe'],timeout:45000});}catch{return '';}}
function status(execution){return az(['containerapp','job','execution','list','-g',group,'-n',name]).find(x=>x.name===execution)?.properties.status;}
if(process.argv[2]==='start'){
 const job=az(['containerapp','job','show','-g',group,'-n',name]);
 assert.equal(job.properties.configuration.triggerType,'Manual');assert.equal(job.properties.template.containers.length,1);
 assert(!az(['containerapp','job','execution','list','-g',group,'-n',name]).some(x=>x.properties.status==='Running'),'Another migration job is running');
 const api=az(['containerapp','show','-g',group,'-n','hidi-api']),current=api.properties.template.containers[0];
 const env=key=>current.env.find(x=>x.name===key)?.value;
 assert.equal(env('AZURE_SQL_DATABASE'),'hidi-sql-validation');assert.equal(env('AZURE_SQL_SERVER'),'sql-hidi-prod-0927.database.windows.net');
 // The CI identity cannot read SQL control-plane resources. The signed-in
 // existing owner inspected these values in Azure Portal immediately before
 // dispatch; accept only a fresh checkpoint bound to this exact database.
 const checkpoint=JSON.parse(await readFile('deploy/admin-security/owner-checkpoint.json','utf8'));
 assert.equal(checkpoint.server,env('AZURE_SQL_SERVER'));assert.equal(checkpoint.database,env('AZURE_SQL_DATABASE'));
 assert.equal(checkpoint.status,'Online');assert(checkpoint.retentionDays>=1);
 assert(new Date(checkpoint.earliestRestoreDate)<new Date(checkpoint.capturedAt));
 assert(Date.now()-Date.parse(checkpoint.capturedAt)>=0&&Date.now()-Date.parse(checkpoint.capturedAt)<900000,'Fresh owner-observed PITR checkpoint required');
 console.log(JSON.stringify(checkpoint));
 const schema=await readFile('deploy/admin-security/schema.sql','utf8'),publicKey=await readFile('deploy/admin-security/owner-auth-public.pem','utf8');
 const schemaHash=createHash('sha256').update(schema).digest('hex');
 const source=`import {createRequire} from 'node:module';import {publicEncrypt} from 'node:crypto';
 const require=createRequire('/app/apps/api/package.json');const {DeviceCodeCredential}=require('@azure/identity');const sql=require('mssql');
 setTimeout(()=>{console.log('HIDI_OWNER_FAILED::authentication_window_expired');process.exit(2);},720000).unref();
 let pool;
 try{
  const credential=new DeviceCodeCredential({tenantId:'e756fdc0-2646-4e94-ac4d-ed7c11f87f34',clientId:'04b07795-8ddb-461a-bbee-02f9e1bf7b46',userPromptCallback:info=>{const encrypted=publicEncrypt({key:${JSON.stringify(publicKey)},oaepHash:'sha256'},Buffer.from(JSON.stringify({code:info.userCode,url:info.verificationUri}))).toString('base64');console.log('HIDI_OWNER_SIGNIN::'+encrypted);}});
  const token=await credential.getToken('https://database.windows.net/.default');
  pool=await new sql.ConnectionPool({server:process.env.AZURE_SQL_SERVER,database:process.env.AZURE_SQL_DATABASE,authentication:{type:'azure-active-directory-access-token',options:{token:token.token}},options:{encrypt:true,trustServerCertificate:false},connectionTimeout:30000,requestTimeout:120000}).connect();
  const rights=(await pool.request().query("SELECT IS_ROLEMEMBER('db_owner') AS isOwner,HAS_PERMS_BY_NAME(DB_NAME(),'DATABASE','CONTROL') AS canControl")).recordset[0];
  if(rights.isOwner!==1&&rights.canControl!==1)throw new Error('SQL_OWNER_REQUIRED');
  await pool.request().batch(${JSON.stringify(schema)});
  const check=(await pool.request().query("SELECT CASE WHEN OBJECT_ID('dbo.AdminLoginSession','U') IS NOT NULL AND OBJECT_ID('dbo.AdminSalesDeletion','U') IS NOT NULL AND OBJECT_ID('dbo.AdminSalesPrepareDeletion','P') IS NOT NULL THEN 1 ELSE 0 END AS ready")).recordset[0];
  if(check.ready!==1)throw new Error('SCHEMA_VERIFICATION_FAILED');
  console.log('HIDI_OWNER_COMPLETE::'+JSON.stringify({passed:true,schemaHash:${JSON.stringify(schemaHash)}}));
 }catch(e){console.log('HIDI_OWNER_FAILED::'+JSON.stringify({code:e.code??e.errorCode??'MIGRATION_FAILED',number:e.number??null,message:['SQL_OWNER_REQUIRED','SCHEMA_VERIFICATION_FAILED'].includes(e.message)?e.message:'Owner authentication or schema operation failed'}));process.exitCode=1;}finally{if(pool)await pool.close();}`;
 const template=structuredClone(job.properties.template),container=template.containers[0];
 container.image=current.image;container.command=['node'];container.args=['--input-type=module','--eval',source];
 for(const key of ['AZURE_SQL_SERVER','AZURE_SQL_DATABASE']){container.env=(container.env??[]).filter(x=>x.name!==key);container.env.push({name:key,value:env(key)});}
 const dir=await mkdtemp(join(tmpdir(),'hidi-owner-migration-'));
 try{
  const path=join(dir,'execution.json');await writeFile(path,JSON.stringify(template),{mode:0o600});
  const execution=az(['containerapp','job','start','-g',group,'-n',name,'--yaml',path]).name;assert(execution);
  await appendFile(process.env.GITHUB_OUTPUT,`execution=${execution}\ncontainer=${container.name}\n`);console.log('Private owner migration started: '+execution);
  for(let i=0;i<24;i++){
   const output=logs(execution,container.name),match=output.match(/HIDI_OWNER_SIGNIN::([A-Za-z0-9+/=]+)/);
   if(match){console.log('HIDI_OWNER_ENCRYPTED_CHALLENGE::'+match[1]);break;}
   if(output.includes('HIDI_OWNER_FAILED::')||['Failed','Stopped'].includes(status(execution)))throw new Error('Owner authentication setup failed');
   assert(i<23,'Sign-in challenge unavailable');await sleep(5000);
  }
 }finally{await rm(dir,{recursive:true,force:true});}
}else if(process.argv[2]==='wait'){
 const execution=process.env.HIDI_OWNER_EXECUTION,container=process.env.HIDI_OWNER_CONTAINER;assert(execution?.startsWith(name+'-'));assert(container);
 let result;
 for(let i=0;i<80;i++){result=status(execution);if(['Succeeded','Failed','Stopped'].includes(result))break;await sleep(10000);}
 const output=logs(execution,container);
 for(const line of output.split('\n'))if(/HIDI_OWNER_(COMPLETE|FAILED)::/.test(line))console.log(line);
 assert.equal(result,'Succeeded','Owner migration did not succeed');assert(output.includes('HIDI_OWNER_COMPLETE::'),'Owner migration verification missing');
 console.log('Owner migration completed; application permissions and deployment can now be verified.');
}else throw new Error('Expected start or wait');
