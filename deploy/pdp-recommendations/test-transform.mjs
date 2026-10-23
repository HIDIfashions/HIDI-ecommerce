import assert from 'node:assert/strict';
import {transformFlight,transformBundle,footerSentence} from './transform.mjs';
const e=(tag,p)=>['$',tag,null,p];
const review=e('section',{id:'reviews',className:'product-reviews_section__x',children:[
 e('div',{className:'product-reviews_heading__x',children:'old heading'}),
 e('div',{className:'product-reviews_overview__x',children:'Real ratings stay intact'}),
 e('div',{className:'product-reviews_grid__x',children:e('article',{children:'Published customer review'})}),
 e('details',{className:'product-reviews_reviewGuidance__x',children:e('summary',{className:'product-reviews_reviewButton__x',children:'How to write a review'})})]});
const description='Unchanged product description\n₹1,234 — cotton';
const input='1:T'+Buffer.byteLength(description).toString(16)+','+description+
 '2:'+JSON.stringify(review)+'\n'+
 '3:'+JSON.stringify(e('section',{className:'pdp-related',children:[]}))+'\n'+
 '4:'+JSON.stringify(e('$L9',{children:['$2','$3']}))+'\n'+
 '5:'+JSON.stringify(e('p',{children:footerSentence}))+'\n';
const result=transformFlight(input);
assert(result.startsWith('1:T'+Buffer.byteLength(description).toString(16)+','+description));
assert(result.includes('"children":["$3","$2"]'));
assert(result.includes('Real ratings stay intact'));assert(result.includes('Published customer review'));
assert(result.includes('Customer Reviews'));assert(result.includes('Write a review'));
assert(!result.includes('How to write a review'));assert(!result.includes(footerSentence));
for(const text of [JSON.stringify(footerSentence),JSON.stringify(footerSentence).replace('—','\\u2014')]){
 assert.equal(transformBundle('H.jsx("p",{children:'+text+'})'),'null');
 assert.equal(transformBundle('(0,n.jsx)("p",{className:"muted",children:'+text+'})'),'null');
}
assert.equal(transformBundle('H.jsx("p",{children:"Other footer text"})'),'H.jsx("p",{children:"Other footer text"})');
assert.equal(transformBundle('H.jsx("p",{children:"Other \\x26 text"})'),'H.jsx("p",{children:"Other \\x26 text"})');
console.log('PASS: UTF-8 Flight records, section ordering, published reviews, both footer renderers, unrelated copy');
