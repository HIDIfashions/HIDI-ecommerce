import test from 'node:test';import assert from 'node:assert/strict';import {renderHero} from './hero.mjs';
test('initial native hero uses only the current supported public video selection and positions',()=>{
 const html='<html><body><div id="root"><div class="site-shell"><header data-hidi-first-header="true"></header></div></div></body></html>';
 const videos={'/selected.mp4':{mobile:{poster:'/small.webp',avifPoster:'/small.avif'},desktop:{poster:'/large.webp',avifPoster:'/large.avif'}}};
 const selection={active:true,type:'video',url:'/selected.mp4',desktopPosition:'40% 60%',mobilePosition:'20% 80%'};
 const result=renderHero(html,selection,{videos});assert(result.includes('<main id="main" tabindex="-1">'));assert(result.includes('video data-hidi-first-hero'));assert(result.includes('--hero-position-desktop: 40% 60%'));assert(result.includes('--hero-position-mobile: 20% 80%'));assert(result.includes('/small.avif'));assert(result.includes('video.poster='));assert(!result.includes('src="/selected.mp4"'));
 for(const value of [null,{...selection,active:false},{...selection,type:'image'},{...selection,url:'/new.mp4'},{...selection,url:'https://outside.example/selected.mp4'}])assert.equal(renderHero(html,value,{videos}),html);
 const escaped=renderHero(html,{...selection,mobilePosition:'\"><script>alert(1)</script>'},{videos});assert(!escaped.includes('alert(1)'));
});
