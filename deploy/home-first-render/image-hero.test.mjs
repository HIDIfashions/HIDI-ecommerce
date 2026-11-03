import test from 'node:test';import assert from 'node:assert/strict';
import {renderImageHero} from './image-hero.mjs';
import {addHomeDiscovery} from '../seo-document/discovery.mjs';
const html='<html><head></head><body><div id="root"><div class="site-shell"><header data-hidi-first-header="true"></header></div></div><noscript>Fallback</noscript></body></html>';
const item={type:'image',url:'https://hidiindia.com/api/hidi/hero-asset/banner.webp',mobileUrl:'/api/hidi/hero-asset/mobile.webp',fitMode:'contain',desktopPosition:'40% 60%',mobilePosition:'50% 22%',assetId:'first'};
const selected={...item,active:true,items:[item,{type:'video',url:'/next.mp4',assetId:'next'}],autoPlay:true,intervalSeconds:7};
test('image-first selection renders the actual responsive banner ahead of discovery',()=>{
 const output=addHomeDiscovery(renderImageHero(html,selected));
 assert.match(output,/<source media="\(max-width: 700px\)" srcset="\/api\/hidi\/hero-asset\/mobile.webp">/);
 assert.match(output,/fetchpriority="high"/);assert.match(output,/object-fit:contain/);assert.match(output,/--hero-position-mobile:50% 22%/);
 assert(output.indexOf('data-hidi-first-image')<output.indexOf('data-hidi-home-discovery'));
 assert.equal((output.match(/<main\b/g)||[]).length,1);assert.equal((output.match(/<h1\b/g)||[]).length,1);
 assert.match(output,/<section aria-label="Explore HIDI" data-hidi-home-discovery/);
 const bootstrap=JSON.parse(output.match(/window\.__HidiHeroInitial=(.*?);<\/script>/)[1]);
 assert.equal(bootstrap.items[0].fitMode,'contain');assert.equal(bootstrap.items[0].mobileUrl,item.mobileUrl);assert.equal(bootstrap.items[1].type,'video');assert.equal(bootstrap.intervalSeconds,7);
 assert.equal(renderImageHero(output,selected),output);
});
test('video, inactive and unsafe selections preserve the prior path',()=>{
 for(const selection of [null,{...selected,active:false},{...selected,items:[{type:'video',url:'/video.mp4'}]},{...selected,items:[{...item,url:'javascript:alert(1)'}]},{...selected,items:[{...item,url:'https://other.example/a.webp'}]}])assert.equal(renderImageHero(html,selection),html);
});
test('single image, missing mobile art, escaping and no-JS markup remain usable',()=>{
 const output=renderImageHero(html,{...item,active:true,mobileUrl:null,desktopPosition:'"><script>alert(1)</script>',assetId:'</script><script>alert(1)</script>'});
 assert(!output.includes('<source'));assert(!output.includes('<script>alert(1)'));assert(output.includes('href="/collections/all"'));assert(output.includes('--hero-position-desktop:50% 50%'));
});
