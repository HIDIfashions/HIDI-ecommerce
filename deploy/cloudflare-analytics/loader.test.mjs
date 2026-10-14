import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const source=readFileSync(new URL('./loader.js',import.meta.url),'utf8');
test('loads the supplied property once and excludes preview and admin pages',()=>{
  for(const [hostname,pathname,count] of [['hidiindia.com','/',1],['www.hidiindia.com','/collections/all',1],['hidiindia.com','/admin/products',0],['hidiindia.com','/administrator',1],['localhost','/',0],['thidigk.thehidi.com','/',0]]) {
    const scripts=[];
    const document={querySelector:()=>scripts[0],createElement:()=>({setAttribute(name,value){this[name]=value;}}),head:{appendChild(node){scripts.push(node);}}};
    const context={window:{location:{hostname,pathname}},document};
    runInNewContext(source,context);runInNewContext(source,context);
    assert.equal(scripts.length,count);
    if(count) {assert.equal(scripts[0].type,'module');assert.equal(JSON.parse(scripts[0]['data-cf-beacon']).token,'5ab1ee3a7e1b457d90ad7bd08206b7ed');}
  }
});
test('a blocked optional tracker does not throw into commerce code',()=>{
  assert.doesNotThrow(()=>runInNewContext(source,{window:{location:{hostname:'hidiindia.com',pathname:'/cart'}},document:{querySelector(){throw Error('blocked');}}}));
});
