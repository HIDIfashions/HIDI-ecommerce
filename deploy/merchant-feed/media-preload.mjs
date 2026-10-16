// Test-container-only bridge: Azure's managed identity is unavailable off Azure.
// Fetch the same already-public product media through the public storefront.
// The production image and production Node options never include this fixture.
const original=globalThis.fetch.bind(globalThis);
globalThis.fetch=(input,options)=>{
  const url=new URL(typeof input==='string'||input instanceof URL?input:input.url);
  if(url.hostname==='127.0.0.1'&&url.port==='3001'&&url.pathname.startsWith('/media/products/')) {
    if(options?.method&&!['GET','HEAD'].includes(options.method))throw Error('Read-only media fixture');
    return original('https://hidiindia.com'+url.pathname,options);
  }
  return original(input,options);
};
