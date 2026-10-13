// Isolated candidate checks permit loopback transport only. No payment service.
import {pathToFileURL} from 'node:url';
const pw=await import(pathToFileURL(process.env.HIDI_PLAYWRIGHT_MODULE).href);
for(const engine of ['chromium','firefox','webkit']){
  const launch=pw[engine].launch.bind(pw[engine]);
  pw[engine].launch=async options=>{
    const browser=await launch(options),newContext=browser.newContext.bind(browser);
    browser.newContext=async options=>{
      const context=await newContext(options),newPage=context.newPage.bind(context);
      context.newPage=async()=>{
        const page=await newPage();
        await page.route('**/*',route=>{
          const request=route.request(),url=new URL(request.url());
          if(!['127.0.0.1','localhost','::1'].includes(url.hostname))return route.abort();
          if(!['GET','HEAD'].includes(request.method()))return route.abort();
          return route.fallback();
        });
        return page;
      };
      return context;
    };
    return browser;
  };
}
