// Disposable candidate test only: redirect the fixture Azure account to localhost.
const https = require("node:https");
const http = require("node:http");
const original = https.request;
https.request = function (...args) {
  const first=args[0];
  const url=typeof first==="string" ? new URL(first) : first instanceof URL ? first : null;
  const options=url ? {hostname:url.hostname,port:url.port,path:url.pathname+url.search,
    ...(typeof args[1]==="object" ? args[1] : {})} : {...first};
  const hostname=options.hostname || options.host;
  if (hostname==="fixtureaccount.blob.core.windows.net") {
    const callback=args.find(arg=>typeof arg==="function");
    return http.request({...options,hostname:"127.0.0.1",host:"127.0.0.1",
      port:Number(process.env.HIDI_PHOTO_FIXTURE_PORT),protocol:"http:",agent:undefined,
      path:"/fixture-blob"+options.path},callback);
  }
  return original.apply(this,args);
};


