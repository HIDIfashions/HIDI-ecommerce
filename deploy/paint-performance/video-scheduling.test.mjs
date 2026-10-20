import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

// Execute the actual fragments used by the release transform. The reviewed
// original timer block stays byte-for-byte unchanged after the desktop branch.
const patch=readFileSync(new URL('./patch.py',import.meta.url),'utf8');
const fragment=name=>{const match=patch.match(new RegExp(name+" = '''([\\s\\S]*?)'''"));assert(match,name+' fragment missing');return match[1];};
const body=fragment('REVIEWED_VIDEO_GUARD')+fragment('DESKTOP_VIDEO_AFTER_PAINT')+readFileSync(new URL('./video-delay.txt',import.meta.url),'utf8');
function schedule(options={}){
 const calls=[],timers=new Map(),idle=new Map(),cleared=[],cancelled=[];let next=0;
 const video={poster:'/current.avif'},paint={video,poster:video.poster,renderTime:100};
 if(options.paint==='missing')paint.video=null;
 if(options.paint==='different-node')paint.video={poster:video.poster};
 if(options.paint==='different-poster')paint.poster='/old.avif';
 if(options.paint==='zero-time')paint.renderTime=0;
 if(options.paint==='invalid-time')paint.renderTime=Infinity;
 const window={__HidiNativePosterPaint:options.paint==='missing'?null:paint,setTimeout:(fn,ms)=>{const id=++next;timers.set(id,{fn,ms});return id;},clearTimeout:id=>{cleared.push(id);timers.delete(id);}};
 if(options.idle!==false){window.requestIdleCallback=(fn,settings)=>{const id=++next;idle.set(id,{fn,settings});return id;};window.cancelIdleCallback=id=>{cancelled.push(id);idle.delete(id);};}
 const context={window,mobile:options.mobile??false,HidiNativeHeroCache:options.retained===false?null:{},liveVideoRef:{current:options.video===false?null:video},showBundled:options.bundled??false,heroConfigStatus:options.status??'uploaded',reduced:options.reduced??false,HidiHeroSaveData:()=>options.saveData??false,setVideoAllowed:value=>calls.push(value)};
 const cleanup=runInNewContext('(function(){'+body+'})()',context);
 const fireTimer=()=>{const [id,timer]=timers.entries().next().value;timers.delete(id);timer.fn();return {id,ms:timer.ms};};
 const fireIdle=()=>{const [id,callback]=idle.entries().next().value;idle.delete(id);callback.fn();return {id,timeout:callback.settings.timeout};};
 return {calls,timers,idle,cleared,cancelled,cleanup,fireTimer,fireIdle};
}

test('retained desktop video starts after its confirmed matching native poster paint without another timer',()=>{
 const result=schedule();assert.deepEqual(result.calls,[true]);assert.equal(result.timers.size,0);assert.equal(result.idle.size,0);assert.equal(result.cleanup,undefined);
});

test('unconfirmed, changed or unretained desktop video preserves the original delay and idle deadline',()=>{
 for(const options of [{paint:'missing'},{paint:'different-node'},{paint:'different-poster'},{paint:'zero-time'},{paint:'invalid-time'},{retained:false},{video:false}]){
  const result=schedule(options);assert.deepEqual(result.calls,[false]);assert.equal(result.fireTimer().ms,1200);assert.deepEqual(result.calls,[false]);assert.equal(result.fireIdle().timeout,900);assert.deepEqual(result.calls,[false,true]);
 }
});

test('mobile keeps its original 300ms delay, idle timeout and no-idle fallback despite a paint marker',()=>{
 for(const idle of [true,false]){
  const result=schedule({mobile:true,idle});assert.deepEqual(result.calls,[false]);assert.equal(result.fireTimer().ms,300);
  if(idle){assert.deepEqual(result.calls,[false]);assert.equal(result.fireIdle().timeout,900);}assert.deepEqual(result.calls,[false,true]);
 }
});

test('mobile and fallback desktop cleanup cancel pending timer and idle work',()=>{
 for(const mobile of [true,false]){
  const options={mobile,retained:false};const beforeTimer=schedule(options);const timerId=beforeTimer.timers.keys().next().value;beforeTimer.cleanup();assert.deepEqual(beforeTimer.cleared,[timerId]);assert.equal(beforeTimer.timers.size,0);assert.deepEqual(beforeTimer.calls,[false]);
  const beforeIdle=schedule(options);beforeIdle.fireTimer();const idleId=beforeIdle.idle.keys().next().value;beforeIdle.cleanup();assert.deepEqual(beforeIdle.cancelled,[idleId]);assert.equal(beforeIdle.idle.size,0);assert.deepEqual(beforeIdle.calls,[false]);
 }
});

test('configuration, reduced-motion and Save-Data guards dominate confirmed desktop paint and mobile scheduling',()=>{
 for(const mobile of [true,false])for(const options of [{status:'loading'},{status:'error'},{reduced:true},{saveData:true},{bundled:true,status:'bundled',reduced:true},{bundled:true,status:'bundled',saveData:true}]){
  const result=schedule({...options,mobile});assert.deepEqual(result.calls,[false]);assert.equal(result.timers.size,0);assert.equal(result.idle.size,0);assert.equal(result.cleanup,undefined);
 }
});
