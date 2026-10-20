import {createHash} from 'node:crypto';
import {readFileSync,mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';

export const sha256=value=>createHash('sha256').update(value).digest('hex');
export const smallSources=JSON.parse(readFileSync(new URL('./desktop-small-css.json',import.meta.url),'utf8'));
export const unchangedHeaders=[{}, {'user-agent':'Android Mobile'}, {'user-agent':'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Mobile'}, {'user-agent':'Desktop browser','sec-ch-ua-mobile':'?1'}, {'sec-ch-ua-mobile':'?1'}];

export function smallCssFixture(){
 const app=mkdtempSync(join(tmpdir(),'hidi-small-css-')),root=join(app,'dist'),origin='https://hidi-test.azurestaticapps.net';
 const source={'/assets/index-test.css':'.main{padding:0}'.repeat(5400),...smallSources,'/assets/unreviewed.css':'.unreviewed{color:red}'},critical={},styles={},files={};
 const sourceFile=href=>href==='/pricing-assets/styles.css'?join(app,'pricing/styles.css'):join(root,href);
 for(const [href,css] of Object.entries(source)){
  const file=sourceFile(href);mkdirSync(dirname(file),{recursive:true});writeFileSync(file,css);
  const hash=sha256(css),url='/assets/style-'+hash.slice(0,16)+'.css';mkdirSync(dirname(join(root,url)),{recursive:true});writeFileSync(join(root,url),css);
  critical[href]={sha256:hash,critical:'/* critical '+href+' */'};styles[href]={sourceSha256:hash,url,sha256:hash,bytes:Buffer.byteLength(css)};files[url]=hash;
 }
 mkdirSync(join(app,'paint-performance'),{recursive:true});
 const writeMetadata=()=>{
  writeFileSync(join(app,'paint-performance/critical-css.json'),JSON.stringify({styles:critical}));
  writeFileSync(join(app,'paint-performance/style-assets.json'),JSON.stringify({styles}));
  writeFileSync(join(app,'paint-performance/asset-mirror.json'),JSON.stringify({passed:true,bootOnce:true,origin,files}));
 };writeMetadata();
 const tags=Object.keys(source).map((href,index)=>'<link rel="stylesheet" data-fixture="'+index+'" href="'+href+'"><style data-gap="'+index+'">.gap'+index+'{margin:0}</style>');
 const html='<head><meta charset="utf-8">'+tags.join('')+'</head><body><video data-hidi-first-hero></video></body>';
 return {app,root,origin,source,critical,styles,files,sourceFile,writeMetadata,html,close:()=>rmSync(app,{recursive:true,force:true})};
}
