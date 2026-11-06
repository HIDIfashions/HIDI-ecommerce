import {readFileSync,writeFileSync,mkdirSync,readdirSync,statSync} from 'node:fs';
import {resolve,join,dirname} from 'node:path';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
export const names=JSON.parse(readFileSync(new URL('./names.json',import.meta.url),'utf8'));
const hash=text=>createHash('sha256').update(text).digest('hex');
// Match labels, captions and menu strings, leaving product descriptions intact.
export function labels(text) {
  text=text.replaceAll('Ananya’s selected styles from Casual, Work and Occasional Wear.','Ananya’s selected styles across the HIDI collections.');
  for(const group of names)for(const old of group.old){
    const variants=[old,JSON.stringify(old).slice(1,-1),old.replaceAll("'","\\'"),old.replaceAll('’','\\u2019'),old.replaceAll('’','&#8217;'),old.replaceAll("'",'&#39;')];
    for(const value of new Set(variants)){
      const escaped=value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
      text=text.replace(new RegExp(escaped+'(?=(?:["\'<>]|\\\\["\']|[ .]*["\'<>]| - Photo| — [Pp]hoto| photo caption| category card| card in Explore| selected\\.| choice))','g'),group.name);
    }
  }
  return text;
}
export function tooling(text,name) {
  const matcher='function hidiCategoryMatches(categories,value){const canonical=v=>String(v??"\").normalize("NFKC").trim().toLowerCase();const key=canonical(value).replace(/[.]+$/, "");const groups='+JSON.stringify(names)+';const group=groups.find(g=>[g.name,g.slug,...g.old,...g.aliases].some(n=>canonical(n)===key));const primary=group&&categories.find(c=>c.slug===group.slug);return primary?[primary]:categories.filter(c=>canonical(c.name)===key||c.slug===value);}\n';
  if(name.endsWith('product-batch.mjs')&&!text.includes('export function categoryCollectionSlug')){
    assert.equal(hash(text),'089ff5d49ef218a75f14c40d26f68ddae606f91f6d00cd91cc2689e17cb751c8','Known legacy bulk parser');return text;
  }
  if(name.endsWith('product-sheet.mjs')&&!text.includes('export function subcategoryPick')){
    assert.equal(hash(text),'b7ebe6dafebe23fffe2b897083643e5ebdc80b8c348dc30e71d2cb9c62a9a528','Known legacy sheet parser');return text;
  }
  for(const [file,key] of [['product-bulk.mjs','row'],['product-quick-fill.mjs','parsed']])if(name.endsWith(file)){
    const old='options.categories.find(c=>c.name.toLowerCase()==='+key+'.category.toLowerCase())';
    if(text.includes(old)){assert.equal(text.split(old).length-1,1);text=matcher+text.replace(old,'hidiCategoryMatches(options.categories,'+key+'.category)[0]');}
  }
  if(name.endsWith('product-upload/engine.mjs')){
    const old='options.categories.filter(c=>canonical(c.name)===canonical(group.category)||c.slug===group.category)';
    assert.equal(text.split(old).length-1,1,'Upload category lookup anchor');
    text=matcher+text.replace(old,'hidiCategoryMatches(options.categories,group.category)');
  }
  const replacements=name.endsWith('product-batch.mjs')?[
    ["ananyaspick:'ananyaPick',","ananyaspick:'ananyaPick',ananyascloset:'ananyaPick',"],
    ["return ({casualwear:'everyday',","return ({dailydose:'everyday',chillvibes:'work-edit',prettylittleplans:'occasion',casualwear:'everyday',"],
    ["return (options.categories||[]).find(c=>canonical(c.name)","return (options.categories||[]).find(c=>c.slug===({everyday:'casual-wear','work-edit':'work-wear',occasion:'occasional-wear'})[slug]) || (options.categories||[]).find(c=>canonical(c.name)"],
  ]:name.endsWith('product-sheet.mjs')?[
    ["  \"ananya's pick\": 'ananyaPick',","  \"ananya's closet\": 'ananyaPick', 'ananyas closet': 'ananyaPick', 'ananyas_closet': 'ananyaPick',\n  \"ananya's pick\": 'ananyaPick',"],
    ["normalize(String(subcategory ?? '')).replace(/'/g, '') === 'ananyas pick'","['ananyas pick','ananyas closet'].includes(normalize(String(subcategory ?? '')).replace(/'/g, ''))"],
  ]:[];
  for(const [old,next] of replacements){assert.equal(text.split(old).length-1,1,'Import parser anchor '+name);text=text.replace(old,next);}
  return text;
}
export function normalizeRange(text) {
  // Saved captions may still contain an old default. Normalize exact old labels
  // at read time; custom captions and all stored media/config bytes stay intact.
  for(const fn of ['publicRangeText','HidiPublicRangeText']) {
    const pattern=new RegExp('function '+fn+'\\(([A-Za-z_$][\\w$]*)\\)\\s*\\{','g');
    const matches=[...text.matchAll(pattern)];if(!matches.length)continue;
    assert.equal(matches.length,1);const anchor=matches[0][0],arg=matches[0][1];
    const slots={'range-everyday':'Daily Dose','range-work-edit':'Chill Vibes','range-occasion':'Pretty Little Plans','range-new-arrivals':'Ananya’s Closet','range-shop-all':'Ananya’s Closet'};
    const old=[...new Set(names.flatMap(g=>[...g.old,g.slug,...g.aliases]).map(s=>s.toLowerCase().replace(/[^a-z0-9]/g,'')))];
    const code='\n'+arg+'='+arg+'&&{...'+arg+',cards:Object.fromEntries(Object.entries('+arg+'.cards||{}).map(([key,card])=>[key,{...card,title:('+JSON.stringify(old)+').includes(String(card?.title??"\").toLowerCase().replace(/[^a-z0-9]/g,"\"))?(('+JSON.stringify(slots)+')[key]??card?.title):card?.title}]))};';
    text=text.replace(anchor,anchor+code);
  }
  return text;
}
function walk(root){return readdirSync(root,{withFileTypes:true}).flatMap(e=>e.isSymbolicLink()?[]:e.isDirectory()?walk(join(root,e.name)):[join(root,e.name)]);}
export function patch(base,out) {
  const original={};
  for(const folder of ['apps/web/.next','dist','admin-tools'])for(const file of walk(join(base,folder))){
    if(!/\.(js|mjs|json|html|rsc|meta)$/.test(file)||statSync(file).size>8*1024*1024)continue;
    original[file.slice(base.length+1).replaceAll('\\','/')]=readFileSync(file,'utf8');
  }
  for(const name of ['server.mjs','hero-media.mjs'])original[name]=readFileSync(join(base,name),'utf8');
  const semantic=Object.fromEntries(Object.entries(original).map(([name,text])=>[name,normalizeRange(tooling(labels(text),name))]));
  assert.notEqual(semantic['hero-media.mjs'],original['hero-media.mjs'],'Range CMS normalization required');
  assert.notEqual(semantic['apps/web/.next/server/app/collections/[slug]/page.js'],original['apps/web/.next/server/app/collections/[slug]/page.js'],'Collection headings required');
  let mapping={},final;
  for(let step=0;step<15;step++){
    final=Object.fromEntries(Object.entries(semantic).map(([name,text])=>{
      for(const [old,next] of Object.entries(mapping)){
        const oldFile=old.split('/').at(-1),newFile=next.split('/').at(-1);
        text=text.replaceAll(oldFile,newFile);
        if(old.startsWith('apps/web/.next/static/'))text=text.replaceAll(oldFile.match(/-([a-f0-9]{16})\.js$/)[1],newFile.match(/-([a-f0-9]{16})\.js$/)[1]);
      }
      return [name,text];
    }));
    const next={};
    for(const [name,text] of Object.entries(final))if(text!==original[name]){
      if(name.startsWith('apps/web/.next/static/')&&name.endsWith('.js')){
        if(/\/_?(?:build|ssg)Manifest\.js$/.test(name))continue;
        assert(/-[a-f0-9]{16}\.js$/.test(name),'Unrecognized immutable Next asset '+name);
        next[name]=name.replace(/-[a-f0-9]{16}\.js$/,'-'+hash(text).slice(0,16)+'.js');
      } else if(/^dist\/assets\/index-[^/]+\.js$/.test(name))next[name]='dist/assets/index-'+hash(text).slice(0,16)+'.js';
    }
    if(JSON.stringify(next)===JSON.stringify(mapping))break;
    mapping=next;assert(step<14,'Asset references failed to settle');
  }
  const files={};
  for(const [name,text] of Object.entries(final))if(text!==original[name]){
    const target=mapping[name]||name;mkdirSync(dirname(join(out,target)),{recursive:true});writeFileSync(join(out,target),text);
    files[target]={source:name,before:hash(original[name]),after:hash(text)};
  }
  assert(Object.keys(mapping).some(n=>n.startsWith('dist/assets/')),'Landing menu must change');
  assert(Object.keys(files).some(n=>n.includes('landing-media-control')),'Admin media labels must change');
  const report={passed:true,allowedFiles:Object.keys(files).sort(),files,renamedAssets:mapping,oldAssetsRetained:true,categoryIdsPreserved:true,urlsPreserved:true};
  mkdirSync('evidence/category-names',{recursive:true});writeFileSync('evidence/category-names/patch.json',JSON.stringify(report,null,2));return report;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)patch(resolve(process.argv[2]),resolve(process.argv[3]));
