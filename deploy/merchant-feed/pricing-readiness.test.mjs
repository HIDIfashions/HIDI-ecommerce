import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
test('price decoration waits for the product React tree and resumes on its ready event',()=>{
  const source=readFileSync(new URL('../pricing/storefront.mjs',import.meta.url),'utf8').replace(/^import[^\n]+\n/,'');
  const product={dataset:{}},listeners=new Map();let scans=0;
  const context={location:{pathname:'/products/cotton-set'},document:{hidden:false,querySelector:selector=>selector==='[data-hidi-react-pdp]'?product:null,querySelectorAll:()=>{scans++;return [];},addEventListener(){}},window:{addEventListener:(name,fn)=>listeners.set(name,fn)},MutationObserver:class{observe(){}},fetch:()=>new Promise(()=>{}),setInterval(){},queueMicrotask,AbortSignal,catalogueStatus:()=>({ready:false}),priceStatus:()=>({valid:false})};
  vm.runInNewContext(source+'\nglobalThis.applyPricing=apply;',context);
  context.applyPricing();assert.equal(scans,0,'SSR DOM mutated before hydration');
  product.dataset.hidiHydrated='true';listeners.get('hidi:product-ready')();assert(scans>0,'Price decoration did not resume');
});
