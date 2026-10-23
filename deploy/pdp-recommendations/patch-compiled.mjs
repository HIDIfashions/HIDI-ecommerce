import {readFile,writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
const {parse}=await import(pathToFileURL(process.env.HIDI_ACORN_MODULE).href);
const sentence='Indian wear with a calm point of view — made for work, everyday life and the moments in between.';
const prop=(n,key)=>n?.type==='ObjectExpression'?n.properties.find(p=>(p.key?.name??p.key?.value)===key)?.value:undefined;
const value=n=>n?.type==='Literal'?n.value:undefined;
const jsx=n=>n?.type==='CallExpression'&&n.arguments.length>=2&&n.arguments[1]?.type==='ObjectExpression'&&/^(jsx|jsxs)$/.test((n.callee.type==='SequenceExpression'?n.callee.expressions.at(-1):n.callee)?.property?.name);
function walk(n,fn){if(!n||typeof n!=='object')return;fn(n);for(const v of Object.values(n)){if(Array.isArray(v)){for(const x of v)walk(x,fn);}else if(v&&typeof v==='object'){walk(v,fn);}}}
export function patchCompiled(source){
 const counts={footer:0,heading:0,eyebrow:0,empty:0,guidance:0,section:0,related:0,order:0};
 let text=source;
 const ast=()=>parse(text,{ecmaVersion:'latest',sourceType:'module',allowReturnOutsideFunction:true});
 const apply=edits=>{let last=text.length;for(const {start,end,replacement}of edits.sort((a,b)=>b.start-a.start)){assert(end<=last,'Overlapping component edit');text=text.slice(0,start)+replacement+text.slice(end);last=start;}};
 const edits=[];
 function scan(n){
  if(!n||typeof n!=='object')return;
  if(jsx(n)){
   const p=n.arguments[1],tag=value(n.arguments[0]),c=prop(p,'children'),cl=prop(p,'className'),classKey=cl?.property?.name;
   const code=x=>text.slice(x.start,x.end),call=(tag,props)=>`(${code(n.callee)})(${JSON.stringify(tag)},{${props}})`;
   let replacement=null,key=null;
   if(tag==='p'&&value(c)===sentence){replacement='null';key='footer';}
   else if(tag==='h2'&&value(prop(p,'id'))==='product-reviews-heading'){
    edits.push({start:c.start,end:c.end,replacement:'"Customer Reviews"'});counts.heading++;
   }else if(tag==='p'&&value(c)==='CUSTOMER REVIEWS'&&classKey==='eyebrow'){replacement='null';key='eyebrow';}
   else if(tag==='div'&&classKey==='empty'&&code(n).includes('No reviews yet.')){replacement=call('div',`className:${code(cl)},children:${call('p','children:"Be the first to write a review"')}`);key='empty';}
   else if(tag==='details'&&classKey==='reviewGuidance'){
    let button;walk(n,x=>{if(jsx(x)&&value(x.arguments[0])==='summary')button=prop(x.arguments[1],'className');});assert(button,'Review button class');
    replacement=call('div',`className:${code(cl)},children:${call('a',`href:"/account/orders",className:${code(button)},children:"Write a review"`)}`);key='guidance';
   }else if(tag==='section'&&value(prop(p,'id'))==='reviews'){
    edits.push({start:cl.start,end:cl.end,replacement:`(${code(cl)}+" hidi-compact-reviews")`});counts.section++;
   }else if(tag==='div'&&value(cl)==='pdp-related-heading'&&code(n).includes('More from the HIDI edit.')){
    replacement=call('div',`className:"pdp-related-heading",children:${call('div',`children:${call('h2','children:"You May Also Like"')}`)}`);key='related';
   }
   if(replacement!==null){edits.push({start:n.start,end:n.end,replacement});counts[key]++;return;}
  }
  for(const v of Object.values(n)){if(Array.isArray(v)){for(const x of v)scan(x);}else if(v&&typeof v==='object'){scan(v);}}
 }
 scan(ast());apply(edits);
 const orders=[];
 walk(ast(),n=>{
  if(n.type!=='ArrayExpression')return;
  const related=n.elements.findIndex(e=>{let yes=false;walk(e,x=>{if(jsx(x)&&value(prop(x.arguments[1],'className'))==='pdp-related')yes=true;});return yes;});
  if(related<0)return;
  const review=n.elements.findIndex(e=>jsx(e)&&prop(e.arguments[1],'data')&&Object.keys(prop(e.arguments[1],'data')).length>0);
  if(review<0||review===related+1)return;
  const ordered=[...n.elements],entry=ordered.splice(review,1)[0];ordered.splice(ordered.indexOf(n.elements[related])+1,0,entry);
  orders.push({start:n.start,end:n.end,replacement:'['+ordered.map(e=>e?text.slice(e.start,e.end):'').join(',')+']'});counts.order++;
 });apply(orders);parse(text,{ecmaVersion:'latest',sourceType:'module',allowReturnOutsideFunction:true});
 return {text,counts};
}
if(process.argv[2]){
 const manifest=JSON.parse(await readFile(process.argv[2],'utf8')),report=[];
 for(const entry of manifest){const before=await readFile(entry.source,'utf8');const {text,counts}=patchCompiled(before);if(text!==before){await writeFile(entry.target,text);report.push({path:entry.path,counts});}}
 await writeFile(process.argv[3],JSON.stringify(report,null,2));
}
