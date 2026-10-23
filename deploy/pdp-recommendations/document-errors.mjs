// Runs before application scripts and is reset by the browser for each document.
export function captureDocumentErrors(){
 const errors=[];
 Object.defineProperty(window,'__hidiDocumentErrors',{value:errors});
 addEventListener('error',event=>{if(event.message)errors.push(event.message);});
 addEventListener('unhandledrejection',event=>errors.push(event.reason?.message||String(event.reason)));
}

export async function verifyErrorCapture(browser){
 const page=await browser.newPage();
 try{
  await page.addInitScript(captureDocumentErrors);
  await page.goto('data:text/html,<title>Error capture fixture</title>');
  await page.evaluate(()=>{setTimeout(()=>{throw Error('fixture synchronous error');},0);Promise.reject(Error('fixture rejected promise'));});
  await page.waitForFunction(()=>window.__hidiDocumentErrors.length===2);
  const errors=await page.evaluate(()=>window.__hidiDocumentErrors);
  // WebKit redacts synchronous errors on this opaque data: fixture origin.
  if(!errors.some(e=>e.includes('fixture synchronous error')||e==='Script error.')||!errors.some(e=>e.includes('fixture rejected promise')))throw Error('Real JavaScript errors must be captured');
  await page.reload();
  if((await page.evaluate(()=>window.__hidiDocumentErrors)).length)throw Error('Error capture must belong to the current document');
 }finally{await page.close();}
}
