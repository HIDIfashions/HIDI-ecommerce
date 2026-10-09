import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const pw = await import(process.env.HIDI_PLAYWRIGHT_MODULE ? pathToFileURL(process.env.HIDI_PLAYWRIGHT_MODULE).href : 'playwright');
const base = process.env.HIDI_RESPONSIVE_BASE_URL || 'http://127.0.0.1:3188';
const output = resolve('validation/responsive');
await mkdir(output, { recursive: true });
const server = process.env.HIDI_RESPONSIVE_BASE_URL ? null : spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--host', '127.0.0.1', '--port', '3188', '--strictPort'], { stdio: 'ignore' });
const delay = ms => new Promise(done => setTimeout(done, ms));
try {
  let ready = false;
  for (let count = 0; count < 100; count++) { try { ready = (await fetch(base)).ok; } catch {} if (ready) break; await delay(100); }
  assert(ready, 'Homepage preview is ready');
  for (const engine of (process.env.HIDI_BROWSER_ENGINES || 'chromium').split(',')) {
    const browser = await pw[engine].launch({ headless: true });
    try {
      for (const width of [320, 390, 768, 1440]) {
        const context = await browser.newContext({ viewport: { width, height: 844 }, hasTouch: width < 800, reducedMotion: 'reduce' });
        const page = await context.newPage();
        const errors = []; page.on('pageerror', error => errors.push(error.message));
        await context.route('**/*', route => new URL(route.request().url()).origin === base ? route.continue() : route.abort());
        await page.goto(base); await page.locator('.meet-cinematic').waitFor();
        const measure = await page.evaluate(() => { const section = document.querySelector('.meet-section--cinematic'); return { height: section.offsetHeight, viewport: innerHeight, position: getComputedStyle(section.querySelector('.container')).position, scrollWidth: document.documentElement.scrollWidth, width: innerWidth }; });
        assert(measure.scrollWidth <= width + 1, `No horizontal overflow at ${width}`);
        assert.equal(measure.position, 'relative'); assert(measure.height <= measure.viewport, 'Single photo has no pinned slideshow runway');
        assert.equal(await page.locator('.meet-cinematic__model').count(), 1);
        assert.equal(await page.locator('.meet-cinematic__scroll, .meet-cinematic__pick-control, .meet-cinematic__count').count(), 0);
        if (width < 800) {
          await page.locator('.meet-cinematic').scrollIntoViewIfNeeded();
          if (engine === 'chromium') {
            const cdp = await context.newCDPSession(page);
            const before = await page.evaluate(() => scrollY);
            await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ id: 1, x: width / 2, y: 690 }] });
            for (const y of [620, 540, 460, 380, 300, 220]) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ id: 1, x: width / 2, y }] });
            await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
            await delay(200); assert(await page.evaluate(() => scrollY) > before + 100, 'Native touch scroll continues through the second section');
          }
          await page.locator('.site-footer').scrollIntoViewIfNeeded();
          assert(await page.evaluate(() => scrollY) > measure.height, 'Footer is reachable');
        }
        await page.locator('.site-footer').scrollIntoViewIfNeeded();
        assert(await page.locator('.site-footer').isVisible(), 'Footer is reachable after the single photo');
        const subscribe = page.getByRole('button', { name: 'Subscribe to HIDI updates' });
        assert.equal(await subscribe.innerText(), 'Subscribe');
        const button = await subscribe.evaluate(el => { const box = el.getBoundingClientRect(), style = getComputedStyle(el); return { width: box.width, height: box.height, background: style.backgroundColor, family: style.fontFamily, spacing: style.letterSpacing }; });
        assert(button.width >= 90 && button.height >= 44); assert.notEqual(button.background, 'rgba(0, 0, 0, 0)'); assert.match(button.family, /Arial|Helvetica|Segoe UI/); assert.equal(button.spacing, 'normal');
        assert.equal(await page.getByRole('button', { name: 'Workwear Edit', exact: true }).count(), 1);
        if (width === 390 || width === 1440) { await page.locator('.meet-cinematic').scrollIntoViewIfNeeded(); await page.screenshot({ path: resolve(output, `${engine}-picks-${width}.png`) }); await page.locator('.site-footer').scrollIntoViewIfNeeded(); await page.screenshot({ path: resolve(output, `${engine}-footer-${width}.png`) }); }
        assert.deepEqual(errors, []); await context.close(); console.log(`PASS ${engine} homepage ${width}px: normal scrolling, single photo, newsletter, collection label`);
      }
      const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
      const page = await context.newPage();
      const errors=[];page.on('pageerror',error=>errors.push(error.message));
      await context.route('**/*', route => new URL(route.request().url()).origin === base ? route.continue() : route.abort());
      let mode='server', requests=0;
      await context.route('**/api/store/marketing/newsletter',async route=>{requests++;assert.equal(route.request().method(),'POST');assert.deepEqual(route.request().postDataJSON(),{email:'fixture@example.invalid'});await delay(150);await route.fulfill({status:mode==='server'?503:200,contentType:'application/json',body:JSON.stringify(mode==='success'?{ok:true}:mode==='malformed'?{accepted:true}:{message:'Fixture newsletter unavailable'})});});
      await page.goto(base);
      const subscribe=page.getByRole('button',{name:'Subscribe to HIDI updates'}),email=page.locator('#newsletter-email');
      await email.fill('invalid');await subscribe.click();await page.getByRole('alert').waitFor();assert.equal(requests,0);assert(await page.getByRole('alert').evaluate(el=>parseFloat(getComputedStyle(el).fontSize)>=11));
      for(mode of ['server','malformed','success']) {
        await email.fill('fixture@example.invalid');const before=requests;await subscribe.click();await page.getByRole('button',{name:'Submitting subscription'}).waitFor();assert(await page.getByRole('button',{name:'Submitting subscription'}).isDisabled());
        const dialog=page.getByRole('dialog');await dialog.waitFor();assert.equal(requests-before,1);assert.match(await dialog.innerText(),mode==='success'?/subscription has been confirmed/:/Not quite there yet/);assert.equal(await email.inputValue(),mode==='success'?'':'fixture@example.invalid');await page.keyboard.press('Escape');
      }
      console.log(`PASS ${engine} newsletter: invalid email, server failure, malformed response, success, loading states`);
      await page.locator('.meet-cinematic').scrollIntoViewIfNeeded();
      const image=page.locator('.meet-cinematic__model'),initial=await image.getAttribute('src');
      await delay(4200);assert.equal(await image.getAttribute('src'),initial,'Selected photo remains static');
      assert.equal(await page.locator('.meet-cinematic__scroll, .meet-cinematic__pick-control, .meet-cinematic__count').count(),0);
      assert.deepEqual(errors,[]);console.log(`PASS ${engine} single photo remains static without slideshow controls`);await context.close();
    } finally { await browser.close(); }
  }
} finally {
  if (server) { server.kill('SIGTERM'); await new Promise(done => server.exitCode !== null ? done() : server.once('exit', done)); }
}
