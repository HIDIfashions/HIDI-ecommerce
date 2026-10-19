import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
let source='';process.stdin.setEncoding('utf8');for await(const chunk of process.stdin)source+=chunk;source=source.replace(/\r\n/g,'\n');
const prefix='if (!window.__HidiAppStarted) {\n',suffix='\n}\n';
assert(source.startsWith(prefix)&&source.endsWith(suffix),'Application startup guard changed');
assert.equal(createHash('sha256').update(source).digest('hex'),'ecdfc2f216034394284c70b0c7af6eb88f6499907fc7acb2b6715b175748fee6','Reviewed hero application changed; stop before retaining DOM state');
const {minify}=await import(pathToFileURL(process.env.HIDI_TERSER_MODULE||'/tmp/media-tools/node_modules/terser/main.js').href);
const anchor='const mc=document.getElementById("root");';
assert.equal(source.split(anchor).length,2,'Current root entry changed');
const mount='Sf.createRoot(mc).render(o.jsx(cc.StrictMode,{children:o.jsx(ep,{children:o.jsx(bf,{})})}));';
assert.equal(source.split(mount).length,2,'Current root mount changed');
const helper=await readFile(new URL('./retained-hero.js',import.meta.url),'utf8');
const replacement='const HidiMountRoot=Sf.createRoot(mc);if(HidiNativeHeroCache){try{xf().flushSync(()=>HidiMountRoot.render(o.jsx(cc.StrictMode,{children:o.jsx(ep,{children:o.jsx(bf,{})})})));}finally{HidiFinishNativeParking();}}else HidiMountRoot.render(o.jsx(cc.StrictMode,{children:o.jsx(ep,{children:o.jsx(bf,{})})}));';
const body=source.slice(prefix.length,-suffix.length).replace(anchor,helper+'\n'+anchor).replace(mount,replacement);
const result=await minify(body,{
 module:true,compress:{passes:2,unsafe:false},mangle:true,
 keep_fnames:true,keep_classnames:true,format:{comments:false,ascii_only:true}
});
assert(result.code&&result.code.length<source.length,'Expected a nonempty smaller application');
process.stdout.write(prefix+result.code+suffix);
