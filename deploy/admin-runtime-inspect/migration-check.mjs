import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {setTimeout as sleep} from 'node:timers/promises';
const group='rg-hidi-prod',name='job-hidi-validation';
function az(args){try{return JSON.parse(execFileSync('az',[...args,'--only-show-errors','-o','json'],{encoding:'utf8',stdio:['pipe','pipe','pipe']}));}catch{throw new Error('Azure operation failed: '+args.slice(0,3).join(' '));}}
const job=az(['containerapp','job','show','-g',group,'-n',name]);
assert.equal(job.properties.configuration.triggerType,'Manual');
assert.equal(job.properties.template.containers.length,1);
assert(!az(['containerapp','job','execution','list','-g',group,'-n',name]).some(x=>x.properties.status==='Running'));
const identities=Object.values(job.identity.userAssignedIdentities);
assert(identities.some(x=>x.clientId==='953bff4d-4a18-4679-ae55-f301dec0377e'));
const api=az(['containerapp','show','-g',group,'-n','hidi-api']);
const apiContainer=api.properties.template.containers[0];
const template=structuredClone(job.properties.template),container=template.containers[0];
container.image=apiContainer.image;
container.command=['node'];
container.args=['--input-type=module','--eval',`const {PrismaService}=await import('file:///app/apps/api/dist/prisma/prisma.service.js');const db=new PrismaService();try{await db.$connect();const p=await db.$queryRawUnsafe("SELECT HAS_PERMS_BY_NAME(DB_NAME(),'DATABASE','CREATE TABLE') AS createTable,HAS_PERMS_BY_NAME('dbo','SCHEMA','ALTER') AS alterSchema");console.log('HIDI_MIGRATION_PERMISSIONS::'+JSON.stringify(p));}catch(e){console.log('HIDI_MIGRATION_PERMISSIONS::'+JSON.stringify({connected:false,code:e.code??'SQL_CONNECTION',message:String(e.message).replace(/\\s+/g,' ').slice(-250)}));process.exitCode=1;}finally{await db.$disconnect();}`];
for(const [key,value] of Object.entries({AZURE_CLIENT_ID:'953bff4d-4a18-4679-ae55-f301dec0377e',AZURE_SQL_SERVER:apiContainer.env.find(x=>x.name==='AZURE_SQL_SERVER')?.value,AZURE_SQL_DATABASE:apiContainer.env.find(x=>x.name==='AZURE_SQL_DATABASE')?.value})){assert(value);container.env=(container.env??[]).filter(x=>x.name!==key);container.env.push({name:key,value});}
const dir=await mkdtemp(join(tmpdir(),'hidi-migration-check-'));
try{
 const path=join(dir,'execution.json');await writeFile(path,JSON.stringify(template),{mode:0o600});
 const execution=az(['containerapp','job','start','-g',group,'-n',name,'--yaml',path]).name;assert(execution);console.log('Read-only migration permission check started: '+execution);
 let status;
 for(let i=0;i<36;i++){status=az(['containerapp','job','execution','list','-g',group,'-n',name]).find(x=>x.name===execution)?.properties.status;if(['Succeeded','Failed','Stopped'].includes(status))break;await sleep(10000);}
 console.log(JSON.stringify({execution,status}));
 try{const logs=execFileSync('az',['containerapp','job','logs','show','-g',group,'-n',name,'--execution',execution,'--container',container.name,'--tail','100','--only-show-errors'],{encoding:'utf8',stdio:['pipe','pipe','pipe']});for(const line of logs.split('\n'))if(line.includes('HIDI_MIGRATION_PERMISSIONS::'))console.log(line);}catch{console.log('Migration log read unavailable');}
 assert.equal(status,'Succeeded','Existing migration identity cannot complete the read-only SQL check');
}finally{await rm(dir,{recursive:true,force:true});}
