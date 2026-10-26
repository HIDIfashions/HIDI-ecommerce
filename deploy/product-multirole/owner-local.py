"""Apply the owner migration using normal browser-authenticated Azure CLI.

The existing private API terminal is only a transport. A delegated SQL token is
acquired locally, sent over its authenticated encrypted terminal, used in memory,
and never written to a file, CLI argument, workflow artifact, or terminal log.
"""
import base64, gzip, hashlib, json, os, queue, re, subprocess, sys, threading, time
from pathlib import Path
from winpty import PtyProcess

CLI=[sys.executable,'-m','azure.cli']
GROUP='rg-hidi-prod'
def az(args):
    result=subprocess.run(CLI+args+['--only-show-errors','-o','json'],capture_output=True,text=True)
    if result.returncode:
        # Do not print Azure output: token/connection errors may contain secrets.
        raise RuntimeError('Azure operation failed: '+' '.join(args[:3]))
    return json.loads(result.stdout)
assert os.environ.get('AZURE_CONFIG_DIR'),'Use the isolated temporary owner profile'
account=az(['account','show'])
assert account['tenantId']=='e756fdc0-2646-4e94-ac4d-ed7c11f87f34'
assert account['id']=='91d9572d-0f0b-47fe-802d-0eef36d7c719'
assert account['user']['name'].lower()=='fashionshidi@gmail.com'
app=az(['containerapp','show','-g',GROUP,'-n','hidi-api'])
assert app['properties']['latestReadyRevisionName']==app['properties']['latestRevisionName']
container=app['properties']['template']['containers'][0]
env={row['name']:row.get('value') for row in container['env']}
assert env['AZURE_SQL_SERVER']=='sql-hidi-prod-0927.database.windows.net'
assert env['AZURE_SQL_DATABASE']=='hidi-sql-validation'
database=az(['sql','db','show','-g',GROUP,'-s','sql-hidi-prod-0927','-n',env['AZURE_SQL_DATABASE']])
retention=az(['sql','db','str-policy','show','-g',GROUP,'-s','sql-hidi-prod-0927','-n',env['AZURE_SQL_DATABASE']])
assert database['status']=='Online' and retention['retentionDays']>=1 and database['earliestRestoreDate']
token=az(['account','get-access-token','--resource','https://database.windows.net/','--tenant',account['tenantId']])['accessToken']
schema=Path('deploy/product-multirole/schema.sql').read_text()
apply='--apply' in sys.argv
source="""const {createRequire}=require('node:module');const req=createRequire('/app/apps/api/package.json');const sql=req('mssql');
(async()=>{let pool;try{
pool=await new sql.ConnectionPool({server:process.env.AZURE_SQL_SERVER,database:process.env.AZURE_SQL_DATABASE,authentication:{type:'azure-active-directory-access-token',options:{token:TOKEN}},options:{encrypt:true,trustServerCertificate:false},connectionTimeout:30000,requestTimeout:120000}).connect();
const rights=(await pool.request().query("SELECT IS_ROLEMEMBER('db_owner') AS isOwner,HAS_PERMS_BY_NAME(DB_NAME(),'DATABASE','CONTROL') AS canControl")).recordset[0];
if(rights.isOwner!==1&&rights.canControl!==1)throw new Error('SQL_OWNER_REQUIRED');
if(APPLY)await pool.request().batch(SCHEMA);
const guards=GUARD_PROBES;
const objects=(await pool.request().query("SELECT CASE WHEN COL_LENGTH('dbo.AdminStaff','rolesJson') IS NOT NULL THEN 1 ELSE 0 END AS rolesColumn")).recordset[0];
if(APPLY&&Object.values(objects).some(x=>x!==1))throw new Error('SCHEMA_VERIFICATION_FAILED');
console.log('HIDI_OWNER_LOCAL_RESULT::'+JSON.stringify({passed:true,ownerAccessVerified:true,schemaApplied:APPLY,objects,guards}));
}catch(e){console.log('HIDI_OWNER_LOCAL_RESULT::'+JSON.stringify({passed:false,code:e.code??'OWNER_CHECK',number:e.number??null,message:['SQL_OWNER_REQUIRED','SCHEMA_VERIFICATION_FAILED'].includes(e.message)?e.message:'SQL owner operation failed'}));process.exitCode=1;}finally{if(pool)await pool.close();}})();"""
source=source.replace('APPLY','true' if apply else 'false').replace('SCHEMA);',json.dumps(schema)+');').replace('TOKEN',json.dumps(token))
probe=base64.b64encode(Path('deploy/admin-security/guard-probes.mjs').read_bytes()).decode()
source=source.replace('GUARD_PROBES',"await import('data:text/javascript;base64,"+probe+"').then(m=>m.verifyGuards(pool,sql))" if '--verify-guards' in sys.argv else 'null')
packed=base64.b64encode(gzip.compress(source.encode(),mtime=0)).decode()
del token,source
lines=["stty -echo", "node --input-type=commonjs <<'HIDI_OWNER_LOCAL_NODE'",'const packed=[']
lines += [json.dumps(packed[i:i+1800])+',' for i in range(0,len(packed),1800)]
lines += ["].join('');", "eval(require('node:zlib').gunzipSync(Buffer.from(packed,'base64')).toString());",'HIDI_OWNER_LOCAL_NODE','exit']
command=CLI+['containerapp','exec','-g',GROUP,'-n','hidi-api','--revision',app['properties']['latestReadyRevisionName'],'--container',container['name'],'--command','/bin/sh','--only-show-errors']
proc=PtyProcess.spawn(command,dimensions=(40,160),env=dict(os.environ))
chunks=queue.Queue()
def read_console():
    try:
        while proc.isalive():
            chunk=proc.read(65536)
            if chunk:chunks.put(chunk)
    except (EOFError,OSError):pass
    finally:chunks.put(None)
threading.Thread(target=read_console,daemon=True).start()
output='';sent=False;report=None;deadline=time.monotonic()+240
try:
    while time.monotonic()<deadline:
        try:chunk=chunks.get(timeout=1)
        except queue.Empty:continue
        if chunk is None:break
        output+=chunk
        plain=re.sub(r'\x1b\[[0-?]*[ -/]*[@-~]','',output)
        if not sent and re.search(r'(?:^|[\r\n])[^\r\n]{0,160}[#$] $',plain):
            for line in lines:proc.write(line+'\n')
            sent=True
        matches=list(re.finditer(r'HIDI_OWNER_LOCAL_RESULT::(\{[^\r\n]+\})',plain))
        for match in matches:
            try:report=json.loads(match.group(1))
            except ValueError:continue
        if report is not None:break
    if not report:raise RuntimeError('Private owner terminal did not return a complete report')
    report.update(schemaSha256=hashlib.sha256(schema.encode()).hexdigest(),pitrRetentionDays=retention['retentionDays'],earliestRestoreDate=database['earliestRestoreDate'])
    print(json.dumps(report))
    if not report.get('passed'):raise RuntimeError('Private SQL owner operation failed')
    destination=Path('evidence/product-multirole/owner-local-'+('migration' if apply else 'check')+'.json')
    destination.write_text(json.dumps(report,indent=2))
finally:
    # Never emit the terminal transcript or payload.
    output='';lines.clear();packed=''
    if proc.isalive():proc.terminate(force=True)
