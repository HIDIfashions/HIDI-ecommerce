import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {runInNewContext} from 'node:vm';
const source=readFileSync(new URL('./after-hero-paint.js',import.meta.url),'utf8');
function fixture(options={}){
 let ready=false,effect,cleanup;const frames=[],timers=[],cancelled=[],cleared=[],events={};
 const context={HidiHeroReact:{useState:()=>[ready,value=>{ready=value;}],useRef:()=>({current:{getBoundingClientRect:()=>({top:options.top??950})}}),useLayoutEffect:fn=>{effect=fn;},createElement:(tag,props)=>({tag,props})},window:{addEventListener:(name,fn)=>events[name]=fn,removeEventListener:name=>delete events[name],innerHeight:900,scrollY:options.scrollY||0,location:{hash:options.hash||''},performance:{getEntriesByType:()=>[{type:options.navigation||'navigate'}]}},document:{visibilityState:options.hidden?'hidden':'visible'},requestAnimationFrame:fn=>{frames.push(fn);return frames.length;},cancelAnimationFrame:id=>cancelled.push(id),setTimeout:(fn,ms)=>{timers.push({fn,ms});return timers.length;},clearTimeout:id=>cleared.push(id)};
 const component=runInNewContext(source+';HidiBelowFoldPaint',context),children={actual:'original sections'};const first=component({children});cleanup=effect();
 return {events,frames,timers,cancelled,cleared,first,children,get ready(){return ready;},render:()=>component({children}),cleanup:()=>cleanup?.()};
}
test('visible sections, anchors and restored positions are rendered immediately before paint',()=>{
 for(const options of [{top:900},{top:500},{hidden:true},{scrollY:200},{hash:'#collections'},{navigation:'back_forward'}]){const f=fixture(options);assert(f.ready);assert.equal(f.frames.length,0);assert.equal(f.render(),f.children);}
});
test('only off-screen sections wait one paint; original children and DOM structure return without a wrapper',()=>{
 const f=fixture();assert(!f.ready);assert.equal(f.first.tag,'span');assert(f.first.props['aria-hidden']);assert.equal(f.first.props.style.height,0);f.frames[0]();assert(!f.ready);f.frames[1]();assert(f.ready);assert.equal(f.render(),f.children);assert(f.cleared.includes(1));
});
test('a 100ms deadline prevents stalled frames from withholding content, and unmount cancels pending work',()=>{
 const f=fixture();assert.equal(f.timers[0].ms,100);f.timers[0].fn();assert(f.ready);
 const cancelled=fixture();cancelled.cleanup();cancelled.frames[0]();cancelled.timers[0].fn();assert(!cancelled.ready);assert(cancelled.cancelled.includes(1));
});

test('an immediate scroll releases off-screen sections before the next frame',()=>{const f=fixture();assert(!f.ready);f.events.scroll();assert(f.ready);assert.equal(f.events.scroll,undefined);});
