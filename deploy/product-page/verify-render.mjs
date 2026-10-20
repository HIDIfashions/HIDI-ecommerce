import {createRequire,Module} from 'node:module';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
import {AsyncLocalStorage} from 'node:async_hooks';
globalThis.AsyncLocalStorage=AsyncLocalStorage;
const require=createRequire(import.meta.url),ts=require(process.env.HIDI_TYPESCRIPT_MODULE||resolve('apps/web/node_modules/typescript'));
process.env.NODE_PATH=process.env.NODE_PATH||resolve('apps/web/node_modules');Module._initPaths();
const [base,overlay]=process.argv.slice(2),name='apps/web/.next/server/app/products/[slug]/page.js';
require(resolve(base,name));
const webpack=require(resolve(base,'apps/web/.next/server/webpack-runtime.js'));
const {React,ReactDOMServer}=webpack(73142).vendored['react-ssr'];
const context=webpack(36071).AppRouterContext,product=JSON.parse(readFileSync('tests/fixtures/pdp-refinement/product.json','utf8'));
const source=readFileSync(resolve(overlay,name),'utf8'),tree=ts.createSourceFile('pdp.js',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS),components={};
function walk(n){if(ts.isPropertyAssignment(n)&&/^\d+$/.test(n.name.getText(tree))&&ts.isArrowFunction(n.initializer)&&n.initializer.getText(tree).includes('Object.assign(exports,')){
 const mod={exports:{}};const factory=Function('return ('+n.initializer.getText(tree)+')')();factory(mod,mod.exports,webpack);Object.assign(components,mod.exports);return;
}ts.forEachChild(n,walk);}walk(tree);
for(const name of ['AddToCart','ProductMedia','ProductPurchaseSummary','ProductQualitySummary','ProductInfoAccordion']){
 const stream=await ReactDOMServer.renderToReadableStream(React.createElement(context.Provider,{value:{push(){},refresh(){},replace(){},prefetch(){}}},React.createElement(components[name],{product})));
 const html=await new Response(stream).text();
 assert(html.length>0,name+' must render using the retained React/Next exports');console.log('RETAINED_RENDER',name,'passed');
}
