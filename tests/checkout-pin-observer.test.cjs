const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const ts=require('../apps/web/node_modules/typescript');
function fixture(value=''){
 const events=new Map(),timers=new Map();let counter=0;const field={value,isConnected:true,form:{id:'fixture-form'}};
 const document={visibilityState:'visible',querySelector:()=>field,addEventListener:(name,fn)=>events.set('document:'+name,fn),removeEventListener:name=>events.delete('document:'+name)};
 const window={addEventListener:(name,fn)=>events.set('window:'+name,fn),removeEventListener:name=>events.delete('window:'+name)};
 const exports={};const js=ts.transpileModule(fs.readFileSync('apps/web/lib/checkout-pin.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 vm.runInNewContext(js,{exports,document,window,setTimeout:fn=>{timers.set(++counter,fn);return counter;},clearTimeout:id=>timers.delete(id),setInterval:fn=>{events.set('poll',fn);return 1;},clearInterval:()=>events.delete('poll')});
 const calls=[];let changes=0;const stop=exports.observeCheckoutPin((pin,form)=>calls.push({pin,form}),()=>changes++);
 return{field,document,events,calls,stop,changed:()=>changes,emit:name=>events.get('document:'+name)?.(),poll:()=>events.get('poll')?.(),flush:()=>{for(const [id,fn]of [...timers]){timers.delete(id);fn();}}};
}
test('PIN observer sanitizes restored input and debounces one valid six-digit check',()=>{const h=fixture('500 001 extra');assert.equal(h.field.value,'500001');assert.equal(h.calls.length,0);h.flush();assert.equal(h.calls.length,1);assert.equal(h.calls[0].pin,'500001');assert.equal(h.calls[0].form,h.field.form);h.emit('input');h.poll();h.flush();assert.equal(h.calls.length,1);h.stop();});
test('PIN observer cancels stale values and never checks incomplete, hidden or detached fields',()=>{const h=fixture('500001');h.field.value='123';h.emit('input');h.flush();assert.equal(h.calls.length,0);h.document.visibilityState='hidden';h.field.value='600001';h.poll();h.flush();assert.equal(h.calls.length,0);h.document.visibilityState='visible';h.emit('visibilitychange');h.field.isConnected=false;h.flush();assert.equal(h.calls.length,0);h.stop();});
test('PIN observer cleanup removes timers and listeners and prevents later requests',()=>{const h=fixture('500001');h.stop();h.stop();h.flush();h.poll();h.emit('input');assert.equal(h.calls.length,0);assert.equal(h.events.size,0);});
