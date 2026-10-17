import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const code=readFileSync(new URL('./home-app.js',import.meta.url),'utf8');
test('poster completion starts each unchanged application resource once; missing markup and deadline recover',()=>{
 for(const mode of ['poster','missing','deadline']){
  let timer,cleared=0;const appended=[];
  const templates=['LINK','SCRIPT'].map(tagName=>({content:{firstElementChild:{tagName,attributes:[{name:tagName==='LINK'?'href':'src',value:'/assets/index-123.js'},{name:'crossorigin',value:''}],textContent:''}},replaceWith:element=>appended.push(element)}));
  const context={window:{},setTimeout:fn=>{timer=fn;return 1;},clearTimeout:()=>cleared++,document:{readyState:mode==='missing'?'interactive':'loading',querySelector:()=>mode==='missing'?null:{},querySelectorAll:()=>templates,addEventListener:()=>{},createElement:tagName=>({tagName,attributes:{},setAttribute(name,value){this.attributes[name]=value;}})}};
  runInNewContext(code,context);assert.equal(appended.length,mode==='missing'?2:0);
  if(mode==='deadline')timer();else context.window.__HidiLoadHomeApp();
  context.window.__HidiLoadHomeApp();timer();assert.equal(appended.length,2);assert.equal(cleared,1);assert.equal(appended[0].attributes.href,'/assets/index-123.js');assert.equal(appended[1].attributes.src,'/assets/index-123.js');assert.equal(appended[1].attributes.crossorigin,'');
 }
});
