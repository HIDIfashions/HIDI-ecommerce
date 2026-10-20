import test from 'node:test';import assert from 'node:assert/strict';import {createTransferTracker,requireInitialTransferParity,transferAssetIdentity} from './transfer-parity.mjs';

test('transfer tracking separates variable media buffering from page delivery bytes',()=>{
 const tracker=createTransferTracker();
 tracker.requestStarted({requestId:'document',type:'Document'});tracker.loadingFinished({requestId:'document',encodedDataLength:14000});
 tracker.requestStarted({requestId:'video',type:'Media'});tracker.loadingFinished({requestId:'video',encodedDataLength:1250000});
 tracker.requestStarted({requestId:'script',type:'Script'});tracker.loadingFinished({requestId:'script',encodedDataLength:86000});
 assert.deepEqual(tracker.snapshot(),{totalBytes:1350000,nonMediaBytes:100000,mediaBytes:1250000});
});

test('transfer parity keeps the two-percent non-media ceiling and exact media identity',()=>{
 const row=(nonMediaBytes,src='https://mirror.example/media/hero.mp4',poster='data:image/avif;base64,exact')=>({initialNonMediaBytes:nonMediaBytes,initial:{video:{src,poster}}});
 requireInitialTransferParity(row(101999),row(100000,'https://origin.example/media/hero.mp4'),390);
 assert.throws(()=>requireInitialTransferParity(row(102000),row(100000,'https://origin.example/media/hero.mp4'),390),/No non-media transfer regression/);
 assert.throws(()=>requireInitialTransferParity(row(100000,'https://mirror.example/media/other.mp4'),row(100000),390),/Initial video asset changed/);
 assert.throws(()=>requireInitialTransferParity(row(100000,undefined,'data:image\/avif;base64,changed'),row(100000),390),/Initial poster asset changed/);
 assert.equal(transferAssetIdentity('https://mirror.example/media/hero.mp4?v=1'),'/media/hero.mp4?v=1');
});
