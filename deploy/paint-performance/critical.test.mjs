import test from 'node:test';import assert from 'node:assert/strict';import {createRequire} from 'node:module';import {selectInitialCss} from './critical-filter.mjs';
const postcss=createRequire(import.meta.url)(process.env.HIDI_POSTCSS_MODULE);
test('critical selection keeps responsive accessibility, interaction and keyframe rules while dropping unused routes',()=>{
 const css='body{color:black}.unused-route{color:red}@media(prefers-reduced-motion:reduce){*{animation:none}}@media(orientation:landscape)and(max-height:600px){.hero{height:100svh}}@media(pointer:coarse){.button{padding:1rem}}@keyframes appear{from{opacity:0}to{opacity:1}}.button:focus-visible{outline:2px solid}.menu[aria-expanded=true]{display:block}';
 const result=selectInitialCss(postcss,css,[[0,'body{color:black}'.length]]);assert(result.includes('body{color:black}'));assert(!result.includes('unused-route'));for(const key of ['prefers-reduced-motion','max-height:600px','pointer:coarse','@keyframes appear',':focus-visible','aria-expanded'])assert(result.includes(key),key);
});
