import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';import {createHash} from 'node:crypto';
import {normalizeStyleUrls} from './style-urls.mjs';
const [base,overlay]=process.argv.slice(2).map(path=>resolve(path)),hash=value=>createHash('sha256').update(value).digest('hex');
const critical=JSON.parse(await readFile(overlay+'/paint-performance/critical-css.json','utf8')),styles={};
for(const [href,row] of Object.entries(critical.styles)){
 if(!/^\/[\w/.-]+\.css$/.test(href)||href.split('/').includes('..'))throw Error('Unexpected original stylesheet');
 const original=await readFile(href==='/pricing-assets/styles.css'?base+'/pricing/styles.css':base+'/dist'+href,'utf8');
 if(original.length>160000||/@import\b/i.test(original)||/<\/style/i.test(original))throw Error('Unreviewed stylesheet syntax');
 const source=normalizeStyleUrls(original,href);if(hash(source)!==row.sha256)throw Error('Current CSS does not match the verified critical source');
 const css=normalizeStyleUrls(original,href,true),sha256=hash(css),url='/assets/style-'+sha256.slice(0,16)+'.css';
 await mkdir(overlay+'/dist/assets',{recursive:true});await writeFile(overlay+'/dist'+url,css);
 styles[href]={sourceSha256:row.sha256,url,sha256,bytes:Buffer.byteLength(css)};
}
if(!Object.keys(styles).length)throw Error('No verified full stylesheets');
await writeFile(overlay+'/paint-performance/style-assets.json',JSON.stringify({styles}));
console.log('Prepared exact original CSS rules with HIDI resource URLs: '+Object.keys(styles).length);
