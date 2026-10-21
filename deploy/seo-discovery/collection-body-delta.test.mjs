import test from 'node:test';
import assert from 'node:assert/strict';
import { collectionAllDescription, collectionAllTitle, compareReviewedCollectionBodies } from './collection-body-delta.mjs';

const oldDescription="Shop HIDI women's kurta sets and Indian wear for work, everyday dressing and special occasions. Explore colours, sizes and the complete collection.";
const oldMetadataTitle=String.raw`Women's Kurta Sets \u0026 Indian Wear | HIDI`;
const newMetadataTitle=String.raw`Women’s Kurta Sets \u0026 Indian Wear | HIDI`;
const oldHeader='<header class="collection-header"><h1>All Products</h1></header>';
const newHeader='<header class="collection-header" style="display:block"><h1>Women’s Kurta Sets &amp; Indian Wear</h1><p class="hidi-collection-intro" style="display:block">'+collectionAllDescription+'</p></header>';
const oldFlightHeader=String.raw`[\"$\",\"header\",null,{\"className\":\"collection-header\",\"children\":[\"$\",\"h1\",null,{\"children\":\"All Products\"}]}]`;
const newFlightHeader=String.raw`[\"$\",\"header\",null,{\"className\":\"collection-header\",\"style\":{\"display\":\"block\"},\"children\":[[\"$\",\"h1\",null,{\"children\":\"Women’s Kurta Sets \u0026 Indian Wear\"}],[\"$\",\"p\",null,{\"className\":\"hidi-collection-intro\",\"style\":{\"display\":\"block\"},\"children\":\"${collectionAllDescription}\"}]]}]`;
const meta=(title,description)=>String.raw`{\"children\":\"${title}\"}{\"name\":\"description\",\"content\":\"${description}\"}{\"property\":\"og:title\",\"content\":\"${title}\"}{\"property\":\"og:description\",\"content\":\"${description}\"}{\"name\":\"twitter:title\",\"content\":\"${title}\"}{\"name\":\"twitter:description\",\"content\":\"${description}\"}`;
const graph=name=>`<script type="application/ld+json">{"@context":"https://schema.org","@type":"BreadcrumbList","itemListElement":[{"@type":"ListItem","position":1,"name":"Home","item":"https://hidiindia.com/"},{"@type":"ListItem","position":2,"name":"${name}","item":"https://hidiindia.com/collections/all"}]}</script>`;
const rscBreadcrumb=name=>String.raw`{\\\"@type\\\":\\\"ListItem\\\",\\\"position\\\":2,\\\"name\\\":\\\"${name}\\\",\\\"item\\\":\\\"https://hidiindia.com/collections/all\\\"}`;
const common='<script>window.routeSearchMetadata={"/collections/all":{"title":"'+collectionAllTitle+' | HIDI India","description":"'+collectionAllDescription+'"}}</script><article>Product sentinel</article>';
const prior=graph('All Products')+oldHeader+meta(oldMetadataTitle,oldDescription)+rscBreadcrumb('All Products')+oldFlightHeader+common;
const candidate=graph(collectionAllTitle)+newHeader+meta(newMetadataTitle,collectionAllDescription)+rscBreadcrumb(String.raw`Women’s Kurta Sets \u0026 Indian Wear`)+newFlightHeader+common;

test('normalization reverses only the count-locked approved Shop All search-copy transforms',()=>{
  const result=compareReviewedCollectionBodies(prior,candidate);
  assert.equal(result.exactNormalizedMatch,true);
  assert.equal(result.candidate.breadcrumbLabel,collectionAllTitle);
  assert.deepEqual(result.operations.map(value=>[value.label,value.occurrences]),[
    ['visible header, H1 and intro',1],['serialized header, H1 and intro',1],
    ['document title',1],['Open Graph title',1],['Twitter title',1],
    ['document description',1],['Open Graph description',1],['Twitter description',1],
    ['visible BreadcrumbList position 2 label',1],['serialized BreadcrumbList position 2 label',1],
  ]);
});

test('normalization rejects an unreviewed body change and duplicate approved anchors',()=>{
  assert.throws(()=>compareReviewedCollectionBodies(prior,candidate.replace('Product sentinel','Changed product')),/differs outside/);
  assert.throws(()=>compareReviewedCollectionBodies(prior,candidate+newHeader),/must occur exactly once|exactly one visible collection header/);
});

test('normalization rejects a breadcrumb that does not use the approved label',()=>{
  assert.throws(()=>compareReviewedCollectionBodies(prior,candidate.replace(`"name":"${collectionAllTitle}"`,`"name":"Other"`)),/BreadcrumbList position 2/);
});
