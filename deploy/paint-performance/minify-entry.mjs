import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
let source='';process.stdin.setEncoding('utf8');for await(const chunk of process.stdin)source+=chunk;source=source.replace(/\r\n/g,'\n');
const prefix='if (!window.__HidiAppStarted) {\n',suffix='\n}\n';
assert(source.startsWith(prefix)&&source.endsWith(suffix),'Application startup guard changed');
const {minify}=await import(pathToFileURL(process.env.HIDI_TERSER_MODULE||'/tmp/media-tools/node_modules/terser/main.js').href);
const result=await minify(source.slice(prefix.length,-suffix.length),{
 module:true,compress:{passes:2,unsafe:false},mangle:true,
 keep_fnames:true,keep_classnames:true,format:{comments:false,ascii_only:true}
});
assert(result.code&&result.code.length<source.length,'Expected a nonempty smaller application');
process.stdout.write(prefix+result.code+suffix);
