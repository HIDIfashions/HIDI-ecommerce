import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {runInNewContext} from 'node:vm';
const code=readFileSync(new URL('./video-client.js',import.meta.url),'utf8');
test('supported mobile video is smaller AV1, while unsupported and desktop keep original MP4',()=>{
 let mobile=true,supported=true;const context={HidiMediaManifest:{videos:{'/selected.mp4':{mobile:{url:'/mobile.mp4',av1Url:'/mobile-av1.mp4'},desktop:{url:'/desktop.mp4'}}}},HidiMediaPath:value=>value,matchMedia:()=>({matches:mobile}),document:{createElement:()=>({canPlayType:()=>supported?'probably':''})}};runInNewContext(code,context);
 assert.equal(context.HidiMediaVideo('/selected.mp4'),'/mobile-av1.mp4');supported=false;assert.equal(context.HidiMediaVideo('/selected.mp4'),'/mobile.mp4');supported=true;mobile=false;assert.equal(context.HidiMediaVideo('/selected.mp4'),'/desktop.mp4');assert.equal(context.HidiMediaVideo('/new.mp4'),'/new.mp4');
 mobile=true;let loaded=0,played=0,failed=0;const video={src:'/mobile-av1.mp4',dataset:{},autoplay:true,load:()=>loaded++,play:()=>{played++;return Promise.resolve();}};
 context.HidiMediaVideoFallback({currentTarget:video},'/selected.mp4',()=>failed++);assert.equal(video.src,'/mobile.mp4');assert.equal(loaded,1);assert.equal(played,1);assert.equal(failed,0);assert.equal(context.HidiMediaVideo('/selected.mp4'),'/mobile.mp4');context.HidiMediaVideoFallback({currentTarget:video},'/selected.mp4',()=>failed++);assert.equal(failed,1);
});
