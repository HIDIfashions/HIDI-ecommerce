import assert from 'node:assert/strict';
import {patchCompiled} from './patch-compiled.mjs';
const input=`
function guide(){return (0,n.jsxs)("details",{className:s.reviewGuidance,children:[(0,n.jsx)("summary",{className:s.reviewButton,children:"How to write a review"}),(0,n.jsx)("div",{children:"Guidance"})]})}
function reviews(data){return (0,n.jsxs)("section",{id:"reviews",className:s.section,children:[(0,n.jsxs)("div",{className:s.heading,children:[(0,n.jsx)("p",{className:s.eyebrow,children:"CUSTOMER REVIEWS"}),(0,n.jsx)("h2",{id:"product-reviews-heading",children:"What HIDI customers say"})]}),data.reviewCount?renderPublishedReviews(data):(0,n.jsx)("div",{className:s.empty,children:(0,n.jsxs)("div",{children:[(0,n.jsx)("strong",{children:"No reviews yet."}),(0,n.jsx)("p",{children:"Your experience could help someone find their next favourite piece."})]})})]})}
function page(){return (0,n.jsxs)(Shell,{children:[grid,(0,n.jsx)(Reviews,{data:reviewsData}),related.length>0&&(0,n.jsxs)("section",{className:"pdp-related",children:[(0,n.jsxs)("div",{className:"pdp-related-heading",children:[(0,n.jsx)("h2",{children:"More from the HIDI edit."}),(0,n.jsx)(Link,{href:"/collections/all",children:"Shop all"})]}),cards]}),recent]})}
const foot=(0,n.jsx)("p",{className:"muted",children:"Indian wear with a calm point of view — made for work, everyday life and the moments in between."});
`;
const result=patchCompiled(input);
assert(Object.values(result.counts).every(c=>c===1),JSON.stringify(result.counts));
assert(result.text.includes('renderPublishedReviews(data)'));
assert(result.text.indexOf('className:"pdp-related"')<result.text.indexOf('(0,n.jsx)(Reviews,{data:reviewsData})'));
assert(result.text.includes('href:"/account/orders"'));
assert(!result.text.includes('How to write a review'));assert(!result.text.includes('Indian wear with'));
console.log('PASS: only approved AST components change; published reviews and purchase code preserved');
