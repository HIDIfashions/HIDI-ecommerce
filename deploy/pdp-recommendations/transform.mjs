// Local preview adapter for the retained production runtime. Transform the SSR
// HTML and its matching Flight model together, before React hydrates.
export const footerSentence='Indian wear with a calm point of view — made for work, everyday life and the moments in between.';
const element=(tag,props)=>['$',tag,null,props];
const isElement=n=>Array.isArray(n)&&n[0]==='$'&&n[3]&&typeof n[3]==='object';
const props=n=>isElement(n)?n[3]:{};
const cls=n=>props(n).className||'';
const children=n=>Array.isArray(props(n).children)&&!isElement(props(n).children)?props(n).children:[props(n).children];
function text(n){if(typeof n==='string')return n;if(isElement(n))return text(props(n).children);if(Array.isArray(n))return n.map(text).join('');return '';}
function transformTree(n){
 if(!n||typeof n!=='object')return n;
 if(isElement(n)){
  const p=props(n);
  if(n[1]==='p'&&text(n)===footerSentence)return null;
  if(p.id==='reviews'){
   p.className+=' hidi-compact-reviews';
   p.children=children(n).map(child=>{
    if(cls(child).includes('_heading'))return element('div',{className:cls(child),children:element('div',{children:element('h2',{id:'product-reviews-heading',children:'Customer Reviews'})})});
    if(cls(child).includes('_empty'))return element('div',{className:cls(child),children:element('p',{children:'Be the first to write a review'})});
    if(cls(child).includes('_reviewGuidance')){
     const button=children(child).find(c=>cls(c).includes('_reviewButton'));
     return element('div',{className:cls(child),children:element('a',{href:'/account/orders',className:cls(button),children:'Write a review'})});
    }
    return child;
   });
  }
  if(p.className==='pdp-related-heading')p.children=element('div',{children:element('h2',{children:'You May Also Like'})});
 }
 if(Array.isArray(n))return n.map(transformTree);
 return Object.fromEntries(Object.entries(n).map(([key,value])=>[key,transformTree(value)]));
}
export function transformFlight(body){
 // Flight text records are byte-counted and can contain embedded newlines.
 // Keep those opaque; splitting the entire response on newlines corrupts them.
 const buffer=Buffer.from(body),rows=[],models=new Map();let cursor=0;
 while(cursor<buffer.length){
  const colon=buffer.indexOf(58,cursor);if(colon<0){rows.push(buffer.subarray(cursor).toString());break;}
  if(buffer[colon+1]===84){
   const comma=buffer.indexOf(44,colon+2),length=parseInt(buffer.subarray(colon+2,comma).toString(),16),end=comma+1+length;
   rows.push(buffer.subarray(cursor,end).toString());cursor=end;
  }else{
   const nl=buffer.indexOf(10,colon),end=nl<0?buffer.length:nl+1;rows.push(buffer.subarray(cursor,end).toString());cursor=end;
  }
 }
 for(let i=0;i<rows.length;i++){
  const match=rows[i].match(/^([a-f0-9]+):(\[.*|\{.*)\n?$/);if(!match)continue;
  try{models.set(match[1],{index:i,value:transformTree(JSON.parse(match[2]))});}catch{}
 }
 const resolve=n=>typeof n==='string'&&/^\$L?[a-f0-9]+$/.test(n)?models.get(n.replace(/^\$L?/,''))?.value:n;
 function reorder(n){
  if(!n||typeof n!=='object')return;
  if(isElement(n)){
   const list=children(n),ri=list.findIndex(c=>props(resolve(c)).id==='reviews'),ai=list.findIndex(c=>cls(resolve(c))==='pdp-related');
   if(ri>=0&&ai>=0){const [review]=list.splice(ri,1);list.splice(list.findIndex(c=>cls(resolve(c))==='pdp-related')+1,0,review);props(n).children=list;}
  }
  for(const v of Object.values(n))reorder(v);
 }
 for(const {value}of models.values())reorder(value);
 for(const [id,{index,value}]of models)rows[index]=id+':'+JSON.stringify(value)+'\n';
 return rows.join('');
}
export function transformHtml(html,css){
 // Retire the old wrapper's post-hydration review relocation.
 html=html.replace(/\/\* Trust before diversion: reviews directly after the main PDP grid\. \*\/[\s\S]*?grid\.insertAdjacentElement\("afterend", reviews\);\s*\}/g,'/* Recommendations remain immediately after the product information. */');
 html=html.replace(/<p\b[^>]*>Indian wear with a calm point of view — made for work, everyday life and the moments in between\.<\/p>/g,'');
 const review=html.match(/<section\b[^>]*\bid="reviews"[^>]*>[\s\S]*?<\/section>/);
 if(review){
  let block=review[0].replace(/class="([^"]+)"/,'class="$1 hidi-compact-reviews"')
   .replace(/<p\b[^>]*>CUSTOMER REVIEWS<\/p>/,'')
   .replace('What HIDI customers say','Customer Reviews')
   .replace(/(<div class="[^"]*?_empty[^\"]*">)[\s\S]*?<\/div><\/div>/,'$1<p>Be the first to write a review</p></div>')
   .replace(/<details class="([^"]*?_reviewGuidance[^"]*)">[\s\S]*?<summary class="([^"]+)">[\s\S]*?<\/details>/,'<div class="$1"><a href="/account/orders" class="$2">Write a review</a></div>');
  html=html.replace(review[0],'');
  const related=html.match(/<section class="pdp-related">[\s\S]*?<\/section>/);
  if(related)html=html.replace(related[0],related[0]+block);
  else html=html.replace('</main>',block+'</main>');
 }
 html=html.replace(/<div class="pdp-related-heading">[\s\S]*?<\/a><\/div>/,'<div class="pdp-related-heading"><div><h2>You May Also Like</h2></div></div>');
 // Assemble Flight chunks first: records may cross individual script boundaries.
 const pattern=/<script>(self\.__next_f\.push\((\[1,[\s\S]*?\])\))<\/script>/g;
 let payload='';html=html.replace(pattern,(whole,call,json)=>{const data=JSON.parse(json);payload+=data[1];return '';});
 if(payload){const json=JSON.stringify([1,transformFlight(payload)]).replace(/</g,'\\u003c');html=html.replace('</body>','<script>self.__next_f.push('+json+')</script></body>');}
 return html.replace('</head>','<style data-hidi-pdp-recommendations="true">'+css+'</style></head>');
}
export function transformBundle(source){
 // The standalone landing page renders its own footer; remove the exact node.
 const pattern=/(?:[\w$]+\.jsx|\(0,[\w$]+\.jsx\))\("p",\{[^{}]*children:("(?:[^"\\]|\\.)*")\}\)/g;
 return source.replace(pattern,(node,literal)=>{
  if(!literal.includes('Indian wear with a calm point'))return node;
  return JSON.parse(literal)===footerSentence?'null':node;
 });
}
