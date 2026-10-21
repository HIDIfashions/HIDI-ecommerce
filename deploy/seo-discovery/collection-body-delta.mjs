import assert from 'node:assert/strict';

export const collectionAllTitle='Women’s Kurta Sets & Indian Wear';
export const collectionAllDescription='Browse HIDI women’s kurta sets and Indian wear across work, casual and occasion edits. Compare product details, current prices and size information.';
export const priorCollectionTitle='All Products';
export const priorCollectionDescription="Shop HIDI women's kurta sets and Indian wear for work, everyday dressing and special occasions. Explore colours, sizes and the complete collection.";

const encodedTitle='Women’s Kurta Sets &amp; Indian Wear';
const flightTitle=String.raw`Women’s Kurta Sets \u0026 Indian Wear`;
const priorFlightMetadataTitle=String.raw`Women's Kurta Sets \u0026 Indian Wear | HIDI`;
const candidateFlightMetadataTitle=flightTitle+' | HIDI';
const priorVisibleHeader='<header class="collection-header"><h1>All Products</h1></header>';
const candidateVisibleHeader='<header class="collection-header" style="display:block"><h1>'+encodedTitle+'</h1><p class="hidi-collection-intro" style="display:block">'+collectionAllDescription+'</p></header>';
const priorFlightHeader=String.raw`[\"$\",\"header\",null,{\"className\":\"collection-header\",\"children\":[\"$\",\"h1\",null,{\"children\":\"All Products\"}]}]`;
const candidateFlightHeader=String.raw`[\"$\",\"header\",null,{\"className\":\"collection-header\",\"style\":{\"display\":\"block\"},\"children\":[[\"$\",\"h1\",null,{\"children\":\"${flightTitle}\"}],[\"$\",\"p\",null,{\"className\":\"hidi-collection-intro\",\"style\":{\"display\":\"block\"},\"children\":\"${collectionAllDescription}\"}]]}]`;

const visibleBreadcrumb = name => `{"@type":"ListItem","position":2,"name":"${name}","item":`;
const metadataTitleFragments = title => [
  [String.raw`{\"children\":\"${title}\"}`,String.raw`{\"children\":\"${priorFlightMetadataTitle}\"}`,'document title'],
  [String.raw`{\"property\":\"og:title\",\"content\":\"${title}\"}`,String.raw`{\"property\":\"og:title\",\"content\":\"${priorFlightMetadataTitle}\"}`,'Open Graph title'],
  [String.raw`{\"name\":\"twitter:title\",\"content\":\"${title}\"}`,String.raw`{\"name\":\"twitter:title\",\"content\":\"${priorFlightMetadataTitle}\"}`,'Twitter title'],
];
const metadataDescriptionFragments = description => [
  [String.raw`{\"name\":\"description\",\"content\":\"${description}\"}`,String.raw`{\"name\":\"description\",\"content\":\"${priorCollectionDescription}\"}`,'document description'],
  [String.raw`{\"property\":\"og:description\",\"content\":\"${description}\"}`,String.raw`{\"property\":\"og:description\",\"content\":\"${priorCollectionDescription}\"}`,'Open Graph description'],
  [String.raw`{\"name\":\"twitter:description\",\"content\":\"${description}\"}`,String.raw`{\"name\":\"twitter:description\",\"content\":\"${priorCollectionDescription}\"}`,'Twitter description'],
];

function count(source,needle) {
  let total=0,offset=0;
  while((offset=source.indexOf(needle,offset))>=0){total++;offset+=needle.length;}
  return total;
}
function replaceOnce(source,before,after,label,operations) {
  const occurrences=count(source,before);
  assert.equal(occurrences,1,`${label} must occur exactly once in the reviewed Shop All body`);
  operations.push({label,occurrences});
  return source.replace(before,after);
}

export function inspectCollectionBody(body) {
  const headers=[...body.matchAll(/<header class="collection-header"([^>]*)>([\s\S]*?)<\/header>/g)];
  assert.equal(headers.length,1,'Shop All body contains exactly one visible collection header');
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
  for(const [,prior,label] of metadataTitleFragments(candidateFlightMetadataTitle)) assert.equal(count(body,prior),1,`Prior ${label} remains exact`);
  for(const [,prior,label] of metadataDescriptionFragments(collectionAllDescription)) assert.equal(count(body,prior),1,`Prior ${label} remains exact`);
  return value;
}

export function normalizeCandidateCollectionBody(body) {
  const value=inspectCollectionBody(body);
  assert.equal(value.heading,collectionAllTitle,'Candidate Shop All H1 is the exact approved title');
  assert.equal(value.introCount,1,'Candidate Shop All contains one approved intro');
  assert.equal(value.intro,collectionAllDescription,'Candidate Shop All intro is exact');
  assert.match(value.headerStyle,/\bstyle="display:block"/,'Candidate Shop All header is explicitly visible');
  assert.match(value.introStyle,/\bstyle="display:block"/,'Candidate Shop All intro is explicitly visible');
  assert.equal(value.breadcrumbLabel,collectionAllTitle,'Candidate BreadcrumbList position 2 uses the approved collection label');
  const operations=[];
  let normalized=replaceOnce(body,candidateVisibleHeader,priorVisibleHeader,'visible header, H1 and intro',operations);
  normalized=replaceOnce(normalized,candidateFlightHeader,priorFlightHeader,'serialized header, H1 and intro',operations);
  for(const [candidate,prior,label] of metadataTitleFragments(candidateFlightMetadataTitle)) normalized=replaceOnce(normalized,candidate,prior,label,operations);
  for(const [candidate,prior,label] of metadataDescriptionFragments(collectionAllDescription)) normalized=replaceOnce(normalized,candidate,prior,label,operations);
  normalized=replaceOnce(normalized,visibleBreadcrumb(collectionAllTitle),visibleBreadcrumb(priorCollectionTitle),'visible BreadcrumbList position 2 label',operations);
  normalized=replaceOnce(normalized,flightTitle,priorCollectionTitle,'serialized BreadcrumbList position 2 label',operations);
  return {normalized,operations,value};
}

export function compareReviewedCollectionBodies(prior,candidate) {
  const priorValue=assertPriorCollectionBody(prior);
  const result=normalizeCandidateCollectionBody(candidate);
  assert.equal(result.normalized,prior,'Shop All candidate body differs outside the exact reviewed search-copy transforms');
  return {passed:true,prior:priorValue,candidate:result.value,operations:result.operations,normalized:result.normalized,exactNormalizedMatch:true};
}
