import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
let source='';process.stdin.setEncoding('utf8');for await(const chunk of process.stdin)source+=chunk;source=source.replace(/\r\n/g,'\n');
const prefix='if (!window.__HidiAppStarted) {\n',suffix='\n}\n';
assert(source.startsWith(prefix)&&source.endsWith(suffix),'Application startup guard changed');
assert.equal(createHash('sha256').update(source).digest('hex'),'be64784faca5b8bdf10342102ea0917af23c69ed0c205717622cf52f4126c11c','Current reviewed homepage application changed; stop before scheduling sections');
const {minify}=await import(pathToFileURL(process.env.HIDI_TERSER_MODULE||'/tmp/media-tools/node_modules/terser/main.js').href);
const anchor='children:[o.jsx(Tf,{}),o.jsx(Hf,{}),o.jsx(Rf,{}),o.jsx(Uf,{}),o.jsx(Af,{})]';
assert.equal(source.split(anchor).length,2,'Current homepage section order changed');
const replacement='children:[o.jsx(Tf,{}),HidiHeroReact.createElement(HidiBelowFoldPaint,null,o.jsx(Hf,{}),o.jsx(Rf,{}),o.jsx(Uf,{}),o.jsx(Af,{}))]';
const body=source.slice(prefix.length,-suffix.length).replace(anchor,replacement)+'\n'+await readFile(new URL('./after-hero-paint.js',import.meta.url),'utf8');
const result=await minify(body,{
 module:true,compress:{passes:2,unsafe:false},mangle:true,
 keep_fnames:true,keep_classnames:true,format:{comments:false,ascii_only:true}
});
assert(result.code&&result.code.length<source.length,'Expected a nonempty smaller application');
process.stdout.write(prefix+result.code+suffix);
