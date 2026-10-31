import {readFile,writeFile,mkdir} from 'node:fs/promises';import {createHash} from 'node:crypto';import {resolve,join} from 'node:path';
const root=resolve(process.argv[2]),html=await readFile(resolve(root,'../landing-offer-loop/live-home.html'),'utf8');
const refs=[...html.matchAll(/<script type="module" crossorigin src="([^"]+)"/g)].map(x=>x[1]);if(refs.length!==1)throw Error('Expected one storefront module');
const path=refs[0],key=createHash('sha256').update(path).digest('hex'),cached=JSON.parse(await readFile(resolve(root,'../header-theme-preview/cache',key+'.json'),'utf8'));
if(cached.status!==200)throw Error('Storefront module cache is invalid');
await mkdir(join(root,'baseline/dist/assets'),{recursive:true});await writeFile(join(root,'baseline/dist/index.html'),html);await writeFile(join(root,'baseline/dist',path.replace(/^\//,'')),Buffer.from(cached.body,'base64'));
console.log(JSON.stringify({module:path,bytes:Buffer.from(cached.body,'base64').length}));
