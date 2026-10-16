const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const read=name=>fs.readFileSync(path.resolve(__dirname,'../apps/web',name),'utf8');
const header=read('components/header.tsx');
const handler=header.match(/function handleWordmarkClick[^\{]+\{([\s\S]*?)\n  \}/)[1];
function logo(event={},reduce=false){const calls=[];vm.runInNewContext('(function(){'+handler+'})()',{pathname:'/',closeMenu:value=>calls.push(['close',value]),event:{preventDefault:()=>calls.push(['prevent']),...event},window:{matchMedia:()=>({matches:reduce}),scrollTo:value=>calls.push(['scroll',value.behavior])}});return calls;}
test('modified and non-primary logo clicks preserve native link navigation',()=>{for(const event of [{ctrlKey:true},{metaKey:true},{shiftKey:true},{altKey:true},{button:1},{defaultPrevented:true}])assert.deepEqual(logo(event),[]);});
test('logo scroll follows reduced-motion preference',()=>{assert.deepEqual(logo({},true),[['close',false],['prevent'],['scroll','instant']]);assert.deepEqual(logo({},false),[['close',false],['prevent'],['scroll','smooth']]);});
test('decorative detail media mounts on intent and not during initial render',()=>{const code=read('components/editorial-detail-image.tsx');assert.match(code,/useState\(false\)/);assert.match(code,/requested && !failed && <Image/);assert.match(code,/event\.pointerType === "mouse"/);assert.match(code,/connection\?\.saveData/);assert.match(code,/setFailed\(true\)/);assert.match(code,/active && ready && !failed \? 1 : 0/);});
test('detail intent listeners are removed on unmount',()=>{const code=read('components/editorial-detail-image.tsx');for(const name of ['pointerenter','pointerleave','focusin','focusout'])assert(code.includes(`removeEventListener("${name}"`));});
test('quick-add bodies are deferred without changing the shared cart write',()=>{const code=read('components/editorial-product-card.tsx');assert.match(code,/\{open && <>/);assert.match(code,/await addCatalogueVariant\(selected\.id\)/);assert.match(code,/writing\.current = true/);assert.match(code,/trapFocus\(event, dialog\.current\)/);assert.match(code,/aria-labelledby=\{open \?/);});
test('responsive media sizes distinguish spotlight, smaller edits and product cards',()=>{const page=read('app/page.tsx');assert.match(page,/calc\(60vw - 50\.4px\)/);assert.match(page,/calc\(40vw - 33\.6px\)/);assert.match(page,/calc\(50vw - 24px\)/);assert.match(read('components/editorial-product-card.tsx'),/464px/);});
test('mobile hero is bounded and craft imagery is not artificially enlarged',()=>{const css=read('app/home.module.css');assert.match(css,/clamp\(560px, 70svh, 640px\)/);assert.doesNotMatch(css,/scale\(1\.35\)/);assert.match(css,/object-position: center 20%/);});
test('search spacing and newsletter wording avoid crowding and unverified incentives',()=>{assert.match(read('components/header-search.module.css'),/grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);assert.doesNotMatch(read('components/newsletter-signup.tsx'),/Subscribe & get rewarded/);assert.match(read('components/newsletter-signup.tsx'),/email, source: "FOOTER"/);});
