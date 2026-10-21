import assert from 'node:assert/strict';

export const priorCollectionTitle='All Products';
export const priorCollectionDescription="Shop HIDI women's kurta sets and Indian wear for work, everyday dressing and special occasions. Explore colours, sizes and the complete collection.";

const priorFlightMetadataTitle=String.raw`Women's Kurta Sets \u0026 Indian Wear | HIDI`;
const priorVisibleHeader='<header class="collection-header"><h1>All Products</h1></header>';
const priorFlightHeader=String.raw`[\"$\",\"header\",null,{\"className\":\"collection-header\",\"children\":[\"$\",\"h1\",null,{\"children\":\"All Products\"}]}]`;
const priorMetadataFragments=[
  [String.raw`{\"children\":\"${priorFlightMetadataTitle}\"}`,'document title'],
  [String.raw`{\"property\":\"og:title\",\"content\":\"${priorFlightMetadataTitle}\"}`,'Open Graph title'],
  [String.raw`{\"name\":\"twitter:title\",\"content\":\"${priorFlightMetadataTitle}\"}`,'Twitter title'],
  [String.raw`{\"name\":\"description\",\"content\":\"${priorCollectionDescription}\"}`,'document description'],
  [String.raw`{\"property\":\"og:description\",\"content\":\"${priorCollectionDescription}\"}`,'Open Graph description'],
  [String.raw`{\"name\":\"twitter:description\",\"content\":\"${priorCollectionDescription}\"}`,'Twitter description'],
];

function count(source,needle) {
  let total=0,offset=0;
  while((offset=source.indexOf(needle,offset))>=0){total++;offset+=needle.length;}
  return total;
}

export function inspectCollectionBody(body) {
  const headers=[...body.matchAll(/<header class="collection-header"([^>]*)>([\s\S]*?)<\/header>/g)];
  assert.equal(headers.length,1,'Shop All body contains exactly one retained collection header');
  const heading=/<h1[^>]*>([\s\S]*?)<\/h1>/.exec(headers[0][2]);
  const intros=[...headers[0][2].matchAll(/<p class="hidi-collection-intro"([^>]*)>([\s\S]*?)<\/p>/g)];
  const graphs=[...body.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)].flatMap(match=>{
    try {const value=JSON.parse(match[1]);return Array.isArray(value)?value:(value['@graph']||[value]);} catch {return [];}
  });
  const breadcrumb=graphs.find(value=>value?.['@type']==='BreadcrumbList');
  const second=breadcrumb?.itemListElement?.find(value=>value?.position===2);
  return {headerCount:headers.length,headerStyle:headers[0][1],heading:heading?.[1]?.replace(/&amp;/g,'&').trim()||null,
    introCount:intros.length,introStyle:intros[0]?.[1]||null,intro:intros[0]?.[2]?.replace(/&amp;/g,'&').trim()||null,
    breadcrumbLabel:second?.name||null,productArticleCount:(body.match(/<article\b/g)||[]).length};
}

export function assertPriorCollectionBody(body) {
  const value=inspectCollectionBody(body);
  assert.equal(value.heading,priorCollectionTitle,'Prior Shop All H1 matches the inspected renderer');
  assert.equal(value.introCount,0,'Prior Shop All renderer contains no intro');
  assert.equal(value.breadcrumbLabel,priorCollectionTitle,'Prior Shop All breadcrumb matches the inspected renderer');
  assert.equal(count(body,priorVisibleHeader),1,'Prior visible Shop All header remains exact');
  assert.equal(count(body,priorFlightHeader),1,'Prior serialized Shop All header remains exact');
  for(const [fragment,label] of priorMetadataFragments) assert.equal(count(body,fragment),1,`Retained serialized ${label} remains exact`);
  return value;
}

// The technical-only candidate keeps the compiled renderer and its complete
// streamed body. Metadata updates belong in the wrapper head transform; no
// visible markup, RSC payload, JSON-LD label, CSS or script is normalized away.
export function compareReviewedCollectionBodies(prior,candidate) {
  const priorValue=assertPriorCollectionBody(prior);
  const candidateValue=assertPriorCollectionBody(candidate);
  assert.equal(candidate,prior,'Shop All candidate body must remain byte-identical to the prior body; no body delta is permitted');
  return {passed:true,prior:priorValue,candidate:candidateValue,operations:[],body:candidate,exactBodyMatch:true};
}
