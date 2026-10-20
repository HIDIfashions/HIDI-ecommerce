import test from 'node:test';import assert from 'node:assert/strict';
import {assertCssSourceCoverage} from './complete-css-probe.mjs';
const paths=['/assets/index-yOknTVcM.css','/homepage-responsive-1295060fc1cb9b23.css','/assets/next-chapter-8d081c31115549c7.css','/assets/care-break-3de9d6e53702a218.css','/assets/portrait-gallery-e0d043c3470dafd4.css','/storefront-refinements-60be634c50eba5f7.css','/compact-header-526cb1c7fc69a7a3.css','/pricing-assets/styles.css'];
const position=(rawSource,kind,adjacentPrevious=true)=>({rawSource,kind,adjacentPrevious});
const fixture=()=>({documentUrl:'https://hidiindia.com/',inline:paths.slice(1).map(source=>({source})),external:[{source:paths[0]}],sourcePositions:[position('./assets/index-yOknTVcM.css','critical',false),position('./assets/index-yOknTVcM.css?hidi_full=642ee7cd71456af7','external'),...paths.slice(1).map(path=>position(path,'complete-inline'))]});
test('relative original main marker and adjacent full LINK represent the original cascade position',()=>{const snapshot=fixture();assertCssSourceCoverage(snapshot,paths,true);assert.deepEqual(snapshot.sourceOrder,paths);});
test('retained complete LINK proves main source order if the redundant critical STYLE is absent',()=>{const snapshot=fixture();snapshot.sourcePositions.shift();assertCssSourceCoverage(snapshot,paths,true);assert.deepEqual(snapshot.sourceOrder,paths);});
test('mobile adjacent critical/full pairs preserve all eight external source positions',()=>{const snapshot={documentUrl:'https://hidiindia.com/',inline:[],external:paths.map(source=>({source})),sourcePositions:paths.flatMap(path=>[position('.'+path,'critical'),position('.'+path+'?hidi_full=version','external')])};assertCssSourceCoverage(snapshot,paths,false);});
for(const scenario of ['moved-link','missing-link','duplicate-link','intervening-style','intervening-element','repeated-pair'])test('source order rejects '+scenario,()=>{
 const snapshot=fixture();
 if(scenario==='moved-link'){const [link]=snapshot.sourcePositions.splice(1,1);snapshot.sourcePositions.splice(3,0,link);}
 if(scenario==='missing-link'){snapshot.sourcePositions.splice(1,1);snapshot.external=[];}
 if(scenario==='duplicate-link'){snapshot.sourcePositions.splice(2,0,position(paths[0],'external'));snapshot.external.push({source:paths[0]});}
 if(scenario==='intervening-style')snapshot.sourcePositions.splice(1,0,position(null,'critical'));
 if(scenario==='intervening-element')snapshot.sourcePositions[1].adjacentPrevious=false;
 if(scenario==='repeated-pair'){snapshot.sourcePositions.push(position(paths[0],'critical'),position(paths[0],'external'));snapshot.external.push({source:paths[0]});}
 assert.throws(()=>assertCssSourceCoverage(snapshot,paths,true),/cascade positions|covered exactly once/);
});
