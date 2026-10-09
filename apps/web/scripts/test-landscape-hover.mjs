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
    for (const [width, height, touch] of [[320,844,true],[390,844,true],[768,1024,true],[844,390,true],[1440,900,false],[1920,1080,false]]) {
      const context = await browser.newContext({ viewport: { width, height }, hasTouch: touch, reducedMotion: 'reduce' });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await context.route('**/*', async route => {
        const url = new URL(route.request().url());
        if (process.env.HIDI_LAYOUT_LIVE === '1') return ['GET','HEAD'].includes(route.request().method()) ? route.continue() : route.abort();
        if (url.origin !== new URL(base).origin) return route.abort();
        if (url.pathname.startsWith('/api/')) return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ version:1, slots:{}, items:[], products:[], active:false, source:'bundled' }) });
        return route.continue();
      });
      try {
        await page.goto(base, { waitUntil: 'domcontentloaded' });
        await page.locator('.meet-cinematic').waitFor();
        assert.equal(await page.locator('.meet-cinematic__ghost').count(), 0, 'No duplicate/mirrored model');
        assert.equal(await page.locator('.meet-cinematic__model').count(), 5, 'All five original looks retained');
        for (let pick = 0; pick < 5; pick++) {
          const controls = page.locator('.meet-cinematic__pick-control');
          if (await controls.count()) {
            await controls.nth(pick).click();
            await page.locator('.meet-cinematic').scrollIntoViewIfNeeded();
          } else {
            await page.evaluate(index => {
              const section = document.querySelector('#meet-hidi');
              const top = scrollY + section.getBoundingClientRect().top;
              window.scrollTo(0, top + (section.offsetHeight - innerHeight) * ((index + .1) / 5));
            }, pick);
          }
          await page.waitForFunction(index => document.querySelector('.meet-cinematic__count')?.textContent.startsWith(String(index + 1).padStart(2,'0')), pick);
          await page.waitForFunction(() => { const image=document.querySelector('.meet-cinematic__slide.is-active img'); return image?.complete && image.naturalWidth > 0; });
          await page.locator('.meet-cinematic__slide.is-active img').evaluate(async image => { await image.decode(); await new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done))); });
          const geometry = await page.evaluate(() => {
            const canvas = document.querySelector('.meet-cinematic').getBoundingClientRect();
            const image = document.querySelector('.meet-cinematic__slide.is-active img');
            const rect = image.getBoundingClientRect(), css = getComputedStyle(image);
            const contentWidth = rect.width - parseFloat(css.paddingLeft) - parseFloat(css.paddingRight);
            const contentHeight = rect.height - parseFloat(css.paddingTop) - parseFloat(css.paddingBottom);
            const scale = Math.min(contentWidth / image.naturalWidth, contentHeight / image.naturalHeight);
            return { fit:css.objectFit, transform:css.transform, width:rect.width, canvasWidth:canvas.width,
              imageWidth:image.naturalWidth*scale, imageHeight:image.naturalHeight*scale, contentWidth, contentHeight,
              left:rect.left-canvas.left, right:rect.right-canvas.right, top:rect.top-canvas.top, bottom:rect.bottom-canvas.bottom,
              scrollWidth:document.documentElement.scrollWidth, viewport:innerWidth, canvasHeight:canvas.height, viewportHeight:innerHeight };
          });
          assert.equal(geometry.fit, 'contain', 'Full outfit without stretching/cropping');
          assert.equal(geometry.transform, 'none', 'Main model is not reflected or shifted out of frame');
          assert(geometry.left >= -1 && geometry.right <= 1 && geometry.top >= -1 && geometry.bottom <= 1, `Model inside canvas: ${JSON.stringify(geometry)}`);
          assert(geometry.contentWidth > 0 && geometry.contentHeight > 0);
          assert(geometry.imageWidth <= geometry.contentWidth + 1 && geometry.imageHeight <= geometry.contentHeight + 1);
          assert(geometry.scrollWidth <= width + 1, 'No horizontal scrolling');
          if (width > height) assert(geometry.canvasHeight <= height, 'Landscape canvas fits one viewport');
          if (pick === 0 || pick === 4) await page.screenshot({ path:resolve(output,`${engine}-${width}x${height}-pick${pick+1}.png`), animations:'disabled' });
          reports.push({ engine,width,height,pick:pick+1,result:'passed',geometry });
        }
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
            reports.push({engine,width,height,hoverDepth:depth,scale:1.1,result:'passed'});
          }
          await page.mouse.move(0,0);
          await page.waitForFunction(() => [...document.querySelectorAll('.hidi-collection-caption')].filter(el=>Number(getComputedStyle(el).opacity)>.9).length===1);
          await page.locator('.hidi-collection-arrow--next').click();
          await page.keyboard.press('ArrowLeft');
        }
        await page.locator('.site-footer').scrollIntoViewIfNeeded();
        assert(await page.locator('.site-footer').isVisible(),'Footer remains reachable');
        assert.deepEqual(errors, [], 'No uncaught page errors');
        console.log(`PASS ${engine} ${width}x${height}: all looks fit, no mirror, caption/hover and scrolling preserved`);
      } catch(error) {
        const state=await page.evaluate(()=>({hover:matchMedia('(hover: hover)').matches,fine:matchMedia('(pointer: fine)').matches,scrollY,hovering:document.querySelector('.hidi-collection-gallery')?.dataset.hoveringCard,cards:[...document.querySelectorAll('.hidi-collection-card')].map(card=>({depth:card.dataset.depth,hovered:card.dataset.hovered,photoTransform:getComputedStyle(card.querySelector('.hidi-collection-photo')).transform,caption:getComputedStyle(card.querySelector('.hidi-collection-caption')).opacity}))}));
        console.error('LAYOUT FAILURE '+engine+' '+width+' '+JSON.stringify(state));
        await page.screenshot({path:resolve(output,`${engine}-${width}x${height}-failure.png`),animations:'disabled'});
        await writeFile(resolve(output,'partial-report.json'),JSON.stringify(reports,null,2));
        throw error;
      } finally { await context.close(); }
    }
  } finally { await browser.close(); }
}
await writeFile(resolve(output,'report.json'),JSON.stringify(reports,null,2));
console.log(`PASS ${reports.length} focused layout cases`);
