import assert from 'node:assert/strict';

export function createTransferTracker(now=Date.now){
 const requests=new Map();let totalBytes=0,nonMediaBytes=0,lastNonMediaActivity=now();
 return{
  requestStarted(event){if(!event?.requestId)return;const type=event.type||'Other';requests.set(event.requestId,type);if(type!=='Media')lastNonMediaActivity=now();},
  loadingFinished(event){if(!requests.has(event?.requestId))return;const type=requests.get(event.requestId);requests.delete(event.requestId);const bytes=Number(event?.encodedDataLength);if(!Number.isFinite(bytes)||bytes<0)return;totalBytes+=bytes;if(type!=='Media'){nonMediaBytes+=bytes;lastNonMediaActivity=now();}},
  loadingFailed(event){const type=requests.get(event?.requestId);requests.delete(event?.requestId);if(type&&type!=='Media')lastNonMediaActivity=now();},
  settlement(){return{pendingNonMedia:[...requests.values()].filter(type=>type!=='Media').length,lastNonMediaActivity};},
  snapshot(){return{totalBytes,nonMediaBytes,mediaBytes:totalBytes-nonMediaBytes};}
 };
}

export function transferAssetIdentity(value){
 if(typeof value!=='string'||!value)return'';
 if(value.startsWith('data:'))return value;
 try{const url=new URL(value);return url.pathname+url.search;}catch{return value;}
}

export function normalizedInitialRequests(values){
 return values.map(value=>new URL(value).href).sort();
}

export function requireInitialTransferParity(candidate,baseline,width){
 for(const [name,value] of Object.entries({candidate:candidate?.initialNonMediaBytes,baseline:baseline?.initialNonMediaBytes}))assert(Number.isFinite(value)&&value>=0,`${name} non-media transfer evidence is required for ${width}`);
 assert.deepEqual(normalizedInitialRequests(candidate?.initialRequests||[]),normalizedInitialRequests(baseline?.initialRequests||[]),'Initial request route changed for '+width);
 assert(candidate.initialNonMediaBytes<baseline.initialNonMediaBytes*1.02,'No non-media transfer regression for '+width);
 assert.equal(transferAssetIdentity(candidate?.initial?.video?.src),transferAssetIdentity(baseline?.initial?.video?.src),'Initial video asset changed for '+width);
 assert.equal(transferAssetIdentity(candidate?.initial?.video?.poster),transferAssetIdentity(baseline?.initial?.video?.poster),'Initial poster asset changed for '+width);
}
