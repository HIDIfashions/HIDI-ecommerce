import assert from 'node:assert/strict';

// Retry only explicit temporary gateway responses to read-only navigation.
// Browser/script errors and every other HTTP failure remain release failures.
export async function navigate(page,url,evidence,{delay=ms=>new Promise(done=>setTimeout(done,ms))}={}) {
  for(let attempt=1;attempt<=3;attempt++) {
    const response=await page.goto(url,{waitUntil:'domcontentloaded'});
    assert(response,'Navigation returned no HTTP response: '+url);
    const status=response.status();
    if(![502,503,504].includes(status)) {
      assert(response.ok(),'Navigation failed '+status+': '+url);
      return response;
    }
    evidence.push({url,status,attempt});
    assert(attempt<3,'Gateway response persisted after three attempts: '+url);
    await delay(500*attempt);
  }
}
