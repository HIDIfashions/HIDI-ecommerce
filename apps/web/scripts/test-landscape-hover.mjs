import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const pw = await import(pathToFileURL(process.env.HIDI_PLAYWRIGHT_MODULE).href);
const base = process.env.HIDI_LAYOUT_BASE_URL;
assert(base, 'Test the built candidate container');
const output = resolve('validation/landscape-hover');
await mkdir(output, { recursive: true });
const reports = [];
for (const engine of ['chromium', 'firefox', 'webkit']) {
  const browser = await pw[engine].launch({ headless: true, ...(engine === 'firefox' ? { firefoxUserPrefs: { 'ui.primaryPointerCapabilities': 6, 'ui.allPointerCapabilities': 6 } } : {}) });
  try {
    for (const fixture of process.env.HIDI_LAYOUT_LIVE === '1' ? ['live'] : ['portrait', 'landscape']) {
    for (const [width, height, touch] of [[320,844,true],[390,844,true],[768,1024,true],[844,390,true],[1440,900,false],[1920,1080,false]]) {
      const context = await browser.newContext({ viewport: { width, height }, hasTouch: touch, reducedMotion: 'reduce' });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await context.route('**/*', async route => {
        const url = new URL(route.request().url());
        if (process.env.HIDI_LAYOUT_LIVE === '1') return ['GET','HEAD'].includes(route.request().method()) ? route.continue() : route.abort();
        if (url.origin !== new URL(base).origin) return route.abort();
        if (url.pathname.startsWith('/api/')) {
          const slots=Object.fromEntries(['orange','pink','maroon','black','green'].map(color=>[`ananya-${color}`,{active:true,type:'image',url:new URL(fixture === 'landscape' ? '/assets/images/hero-landscape.webp' : `/assets/images/ananya-top-picks/ananya-${color}.webp`,base).href,fitMode:'cover',desktopPosition:'50% 50%',mobilePosition:'50% 50%'}]));
          return route.fulfill({ contentType:'application/json', body:JSON.stringify({version:1,slots,items:[],products:[],active:false,source:'bundled'}) });
        }
        return route.continue();
      });
      try {
        const mediaResponse = page.waitForResponse(response => new URL(response.url()).pathname === '/api/hidi/landing-media-config' && response.request().method() === 'GET');
        await page.goto(base, { waitUntil: 'domcontentloaded' });
        const mediaConfig = await (await mediaResponse).json();
        const configuredPicks = Object.entries(mediaConfig.slots || {}).filter(([id,slot]) => id === 'ananya-green' && slot.active && slot.type === 'image' && slot.url).map(([id]) => id);
        await page.locator('.meet-cinematic').waitFor();
        await page.waitForFunction(ids => ids.every(id => document.querySelector(`.meet-cinematic__model[data-landing-media-slot="${id}"]`)), configuredPicks);
        assert.equal(await page.locator('.meet-cinematic__model').count(), 1, 'Only the selected full-page photo is shown');
        for (const selector of ['.meet-cinematic__ghost','.meet-cinematic__count','.meet-cinematic__pick-control','.meet-cinematic__scroll','.meet-cinematic__tone','.meet-cinematic__prism']) {
          assert.equal(await page.locator(selector).count(), 0, 'Removed slideshow decoration: '+selector);
        }
        await page.locator('.meet-cinematic').scrollIntoViewIfNeeded();
        await page.waitForFunction(() => { const image=document.querySelector('.meet-cinematic__model'); return image?.complete && image.naturalWidth > 0; });
        await page.locator('.meet-cinematic__model').evaluate(async image => { await image.decode(); await new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done))); });
        await page.waitForFunction(() => { const image = document.querySelector('.meet-cinematic__model'); return (image.dataset.ananyaLayout === 'photo') === (image.naturalWidth >= image.naturalHeight); });
        const geometry = await page.evaluate(() => {
          const section=document.querySelector('#meet-hidi');
          const canvas = document.querySelector('.meet-cinematic').getBoundingClientRect();
          const image = document.querySelector('.meet-cinematic__model');
          const rect = image.getBoundingClientRect(), css = getComputedStyle(image);
          const scale = (css.objectFit === 'cover' ? Math.max : Math.min)(rect.width / image.naturalWidth, rect.height / image.naturalHeight);
          return { fit:css.objectFit, transform:css.transform, width:rect.width, canvasWidth:canvas.width,
            photo:image.dataset.ananyaLayout === 'photo', naturalWidth:image.naturalWidth,naturalHeight:image.naturalHeight,
            padding:parseFloat(css.paddingTop)+parseFloat(css.paddingBottom)+parseFloat(css.paddingLeft)+parseFloat(css.paddingRight), canvasLeft:canvas.left, pageWidth:document.body.getBoundingClientRect().width,
            panel:getComputedStyle(document.querySelector('.meet-cinematic'),'::before').display,
            imageWidth:image.naturalWidth*scale, imageHeight:image.naturalHeight*scale, contentWidth:rect.width, contentHeight:rect.height,
            left:rect.left-canvas.left, right:rect.right-canvas.right, top:rect.top-canvas.top, bottom:rect.bottom-canvas.bottom,
            scrollWidth:document.documentElement.scrollWidth, canvasHeight:canvas.height,
            sectionHeight:section.offsetHeight, position:getComputedStyle(section.querySelector('.container')).position };
        });
        const expectedPhoto = fixture === 'landscape' || (fixture === 'live' && geometry.photo);
        assert.equal(geometry.photo, expectedPhoto, 'Upload aspect ratio is detected from its actual dimensions');
        assert.equal(geometry.fit, expectedPhoto && width > height ? 'cover' : 'contain', 'Landscape fills the screen; portraits retain the complete outfit');
        assert.equal(geometry.transform, 'none', 'Photo is not reflected or shifted out of frame');
        assert(geometry.left >= -1 && geometry.right <= 1 && geometry.top >= -1 && geometry.bottom <= 1, `Photo inside canvas: ${JSON.stringify(geometry)}`);
        assert(geometry.contentWidth > 0 && geometry.contentHeight > 0);
        if (geometry.fit === 'cover') assert(geometry.imageWidth >= geometry.contentWidth - 1 && geometry.imageHeight >= geometry.contentHeight - 1, 'Photo covers the screen without empty sides');
        else assert(geometry.imageWidth <= geometry.contentWidth + 1 && geometry.imageHeight <= geometry.contentHeight + 1, 'Complete photo remains visible');
        assert.equal(geometry.padding, 0, 'No inset photo frame');
        assert.equal(geometry.panel, 'none', 'No side panel around full-page photography');
        assert(Math.abs(geometry.width - geometry.pageWidth) <= 1 && Math.abs(geometry.canvasLeft) <= 1, `Photo spans the available page width: ${JSON.stringify(geometry)}`);
        assert(geometry.canvasHeight <= height && geometry.canvasHeight >= height * .6, 'Photo fills the space below the header');
        assert.equal(geometry.position, 'relative', 'Photo scrolls with the page rather than pinning');
        assert(geometry.sectionHeight <= height + 120, 'No multi-screen slideshow runway');
        const divider = await page.evaluate(() => {const heading=document.querySelector('.ananya-section-heading').getBoundingClientRect(),range=document.querySelector('#our-range').getBoundingClientRect(),photo=document.querySelector('.meet-cinematic').getBoundingClientRect();return {headingTop:heading.top,headingBottom:heading.bottom,rangeBottom:range.bottom,photoTop:photo.top};});
        assert(divider.headingTop >= divider.rangeBottom - 1 && divider.headingBottom <= divider.photoTop + 1, 'Ananya follows Explore our range, with the heading above its photo');
        assert.equal(await page.locator('.meet-cinematic__label').count(),0,'Heading is above the photo, not overlaid');
        const controls = await page.locator('.meet-cinematic').evaluate(el => ['.meet-cinematic__content'].map(selector=>{const canvas=el.getBoundingClientRect(),box=el.querySelector(selector).getBoundingClientRect();return {selector,left:box.left-canvas.left,right:box.right-canvas.right,top:box.top-canvas.top,bottom:box.bottom-canvas.bottom};}));
        assert(controls.every(box=>box.left>=0 && box.right<=1 && box.top>=0 && box.bottom<=1), 'Ananya label and Shop now stay inside the photo');
        assert.equal(await page.locator('.meet-cinematic__button').getAttribute('href'), '/collections/all');
        assert(geometry.scrollWidth <= width + 1, 'No horizontal scrolling');
        await page.screenshot({ path:resolve(output,`${fixture}-${engine}-${width}x${height}-single-photo.png`), animations:'disabled' });
        reports.push({ fixture,engine,width,height,result:'passed',geometry });
        await page.locator('.hidi-collection-gallery').scrollIntoViewIfNeeded();
        if (!touch) {
          assert(await page.evaluate(()=>matchMedia('(hover: hover) and (pointer: fine)').matches), 'Desktop runner must emulate a mouse');
          console.log('HOVER CAPABILITIES '+engine+' '+width+' '+JSON.stringify(await page.evaluate(()=>({hover:matchMedia('(hover: hover)').matches,fine:matchMedia('(pointer: fine)').matches,coarse:matchMedia('(pointer: coarse)').matches}))));
          for (const depth of ['active','near']) {
            const card = page.locator(`.hidi-collection-card[data-depth="${depth}"]`).first();
            const bounds=await card.locator('.hidi-collection-photo').boundingBox();
            console.log('HOVER START '+engine+' '+width+' '+depth+' '+JSON.stringify(bounds));
            await card.locator('.hidi-collection-photo').hover({ position:{x:10,y:bounds.height / 2} });
            await page.waitForFunction(() => {
              const image=document.querySelector('[data-hovered="true"] .hidi-collection-photo');
              return image && Math.abs(new DOMMatrix(getComputedStyle(image).transform).a-1.1)<.001;
            });
            const state = await page.evaluate(() => [...document.querySelectorAll('.hidi-collection-card')].map(card => ({hovered:card.dataset.hovered,
              opacity:getComputedStyle(card.querySelector('.hidi-collection-caption')).opacity,
              imageTransform:getComputedStyle(card.querySelector('img')).transform})));
            assert.equal(state.filter(card=>Number(card.opacity)>.9).length,1,'Only hovered caption is visible');
            assert(state.filter(card=>card.hovered==='true').every(card=>card.imageTransform==='none'),'No extra image magnification');
            reports.push({fixture,engine,width,height,hoverDepth:depth,scale:1.1,result:'passed'});
          }
          await page.mouse.move(0,0);
          await page.waitForFunction(() => [...document.querySelectorAll('.hidi-collection-caption')].filter(el=>Number(getComputedStyle(el).opacity)>.9).length===1);
          await page.locator('.hidi-collection-arrow--next').click();
          await page.keyboard.press('ArrowLeft');
        }
        await page.locator('.site-footer').scrollIntoViewIfNeeded();
        assert(await page.locator('.site-footer').isVisible(),'Footer remains reachable');
        assert.deepEqual(errors, [], 'No uncaught page errors');
        console.log(`PASS ${fixture} ${engine} ${width}x${height}: single photo, no scroll controls, full outfit fit, 110% hover and page scrolling`);
      } catch(error) {
        const state=await page.evaluate(()=>({hover:matchMedia('(hover: hover)').matches,fine:matchMedia('(pointer: fine)').matches,scrollY,hovering:document.querySelector('.hidi-collection-gallery')?.dataset.hoveringCard,cards:[...document.querySelectorAll('.hidi-collection-card')].map(card=>({depth:card.dataset.depth,hovered:card.dataset.hovered,photoTransform:getComputedStyle(card.querySelector('.hidi-collection-photo')).transform,caption:getComputedStyle(card.querySelector('.hidi-collection-caption')).opacity}))}));
        console.error('LAYOUT FAILURE '+engine+' '+width+' '+JSON.stringify(state));
        await page.screenshot({path:resolve(output,`${fixture}-${engine}-${width}x${height}-failure.png`),animations:'disabled'});
        await writeFile(resolve(output,'partial-report.json'),JSON.stringify(reports,null,2));
        throw error;
      } finally { await context.close(); }
    }
    }
  } finally { await browser.close(); }
}
await writeFile(resolve(output,'report.json'),JSON.stringify(reports,null,2));
console.log(`PASS ${reports.length} focused layout cases`);
