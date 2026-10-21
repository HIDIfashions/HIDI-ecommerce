import test from 'node:test';
import assert from 'node:assert/strict';
import { priorCollectionDescription, priorCollectionTitle, compareReviewedCollectionBodies } from './collection-body-delta.mjs';

const priorMetadataTitle=String.raw`Women's Kurta Sets \u0026 Indian Wear | HIDI`;
const priorHeader='<header class="collection-header"><h1>All Products</h1></header>';
const priorFlightHeader=String.raw`[\"$\",\"header\",null,{\"className\":\"collection-header\",\"children\":[\"$\",\"h1\",null,{\"children\":\"All Products\"}]}]`;
const metadata=(title,description)=>String.raw`{\"children\":\"${title}\"}{\"name\":\"description\",\"content\":\"${description}\"}{\"property\":\"og:title\",\"content\":\"${title}\"}{\"property\":\"og:description\",\"content\":\"${description}\"}{\"name\":\"twitter:title\",\"content\":\"${title}\"}{\"name\":\"twitter:description\",\"content\":\"${description}\"}`;
const graph=name=>`<script type="application/ld+json">{"@context":"https://schema.org","@type":"BreadcrumbList","itemListElement":[{"@type":"ListItem","position":1,"name":"Home","item":"https://hidiindia.com/"},{"@type":"ListItem","position":2,"name":"${name}","item":"https://hidiindia.com/collections/all"}]}</script>`;
const flightBreadcrumb=String.raw`{\\\"@type\\\":\\\"ListItem\\\",\\\"position\\\":2,\\\"name\\\":\\\"All Products\\\",\\\"item\\\":\\\"https://hidiindia.com/collections/all\\\"}`;
const shared='<article class="retained-product">Product sentinel</article><footer class="site-footer">Footer sentinel</footer>';
const prior=graph(priorCollectionTitle)+priorHeader+metadata(priorMetadataTitle,priorCollectionDescription)+flightBreadcrumb+priorFlightHeader+shared;

test('technical-only Shop All comparison requires exact bytes and preserves existing semantics',()=>{
  const result=compareReviewedCollectionBodies(prior,prior);
  assert.equal(result.exactBodyMatch,true);
  assert.equal(result.body,prior);
  assert.equal(result.candidate.heading,'All Products');
  assert.equal(result.candidate.introCount,0);
  assert.equal(result.candidate.breadcrumbLabel,'All Products');
  assert.deepEqual(result.operations,[]);
});

test('visible copy, an added intro, and visibility overrides cannot be normalized away',()=>{
  for(const replacement of [
    priorHeader.replace('All Products','Women’s Kurta Sets &amp; Indian Wear'),
    priorHeader.replace('</header>','<p class="hidi-collection-intro">New copy</p></header>'),
    priorHeader.replace('class="collection-header"','class="collection-header" style="display:block"'),
  ]) assert.throws(()=>compareReviewedCollectionBodies(prior,prior.replace(priorHeader,replacement)));
});

test('unrelated body markup, footer CSS, and executable scripts must remain exact',()=>{
  for(const changed of [
    prior.replace('Product sentinel','Changed product'),
    prior.replace('retained-product','altered-product'),
    prior+'<style>.site-footer{padding-bottom:126px}</style>',
    prior+'<script>document.querySelector("h1").style.display="block"</script>',
    prior.replace('Footer sentinel','Changed footer'),
  ]) assert.throws(()=>compareReviewedCollectionBodies(prior,changed),/byte-identical/);
});

test('serialized renderer and metadata fields are retained without broad metadata stripping',()=>{
  for(const changed of [
    prior.replace(priorFlightHeader,priorFlightHeader.replace('All Products','Altered Products')),
    prior.replace(priorMetadataTitle,'Changed title'),
    prior.replace(priorCollectionDescription,'Changed description'),
    prior.replace(flightBreadcrumb,flightBreadcrumb.replace('All Products','Altered Products')),
  ]) assert.throws(()=>compareReviewedCollectionBodies(prior,changed));
});

test('breadcrumb changes and duplicate collection headers fail closed',()=>{
  assert.throws(()=>compareReviewedCollectionBodies(prior,prior.replace('"name":"All Products"','"name":"Other"')),/breadcrumb/);
  assert.throws(()=>compareReviewedCollectionBodies(prior,prior+priorHeader),/exactly one retained collection header/);
});

test('an already-mutated renderer cannot masquerade as a preserved baseline',()=>{
  const changed=prior.replace(priorHeader,priorHeader.replace('All Products','Changed Products'));
  assert.throws(()=>compareReviewedCollectionBodies(changed,changed),/H1 matches the inspected renderer/);
});
