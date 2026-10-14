"""Repair fixture transport only. Production parser, auth, and storage are unchanged."""
from pathlib import Path
p=Path('tests/photo-web-upload.browser.mjs');s=p.read_text()
def once(before,after):
 global s
 if after in s:return
 assert s.count(before)==1,'Unexpected fixture anchor: '+before[:100]
 s=s.replace(before,after,1)
once("const results=[],snapshots=[],contexts=[];let browser,child,log='';", "const results=[],snapshots=[],contexts=[],uploadResponses=[];let browser,child,latestPage,log='';")
once("const front=createServer(async(req,res)=>{", """function fixtureRequestBody(req){
 // Cancelling Readable.toWeb(IncomingMessage) destroys its response socket.
 // Keep the request alive long enough to return the parser's actual 4xx JSON.
 const input=Readable.from(req.iterator({destroyOnReturn:false}));
 input.on('close',()=>{if(!req.complete&&!req.destroyed)req.resume();});
 return Readable.toWeb(input);
}
const front=createServer(async(req,res)=>{""")
once("body:Readable.toWeb(req),duplex:'half'", "body:fixtureRequestBody(req),duplex:'half'")
once("   res.writeHead(result.status,Object.fromEntries(result.headers));return res.end(Buffer.from(await result.arrayBuffer()));", "   const responseBytes=Buffer.from(await result.arrayBuffer());uploadResponses.push({status:result.status,body:responseBytes.toString().slice(0,1600)});\n   res.writeHead(result.status,Object.fromEntries(result.headers));return res.end(responseBytes);")
once("results.push({engine,case:name,status:'FAIL',error:String(error.stack||error)});throw error;", "results.push({engine,case:name,status:'FAIL',error:String(error.stack||error),alerts:latestPage?await latestPage.locator('[role=alert]').allTextContents().catch(()=>[]):[],responses:uploadResponses.slice(-3)});throw error;")
once("page.setDefaultTimeout(30000);", "latestPage=page;page.setDefaultTimeout(30000);")
# Preserve failures, but allow the other browser engines to run independently.
marker="  await record(engine,'Corrupted upload shows an error without attaching a photo'"
lines=s.splitlines();bad=[line for line in lines if line.startswith(marker)];assert len(bad)==1
if 'Continue other engines; record() retained the failure.' not in s:
 lines.remove(bad[0]);s='\n'.join(lines)+'\n'
 once("  await record(engine,'Real product-editor screen loads with isolated stock and prices'", "  try {\n  await record(engine,'Real product-editor screen loads with isolated stock and prices'")
 once("  await context.close();await browser.close();browser=undefined;", bad[0]+"\n  } catch { /* Continue other engines; record() retained the failure. */ }\n  finally { await context.close();await browser.close();browser=undefined; }")
once("await record(engine,'Corrupted upload shows an error without attaching a photo',async()=>{await page.locator", "await record(engine,'Corrupted upload shows an error without attaching a photo',async()=>{await page.goto(base+'/admin/products/photo-fixture',{waitUntil:'networkidle'});await page.getByRole('heading',{name:'Upload fixture kurta',exact:true}).waitFor();await page.locator")
s=s.replace('JSON.stringify({results,snapshots,storage:', 'JSON.stringify({results,snapshots,uploadResponses,storage:')
p.write_text(s)
print('Fixture error responses retain their socket; all browser failures remain visible and other engines still execute.')
