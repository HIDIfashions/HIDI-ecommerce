import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { privacyFixture } from './privacy-policy-fixture.mjs';
const playwright = await import(process.env.HIDI_PLAYWRIGHT_MODULE ? pathToFileURL(process.env.HIDI_PLAYWRIGHT_MODULE).href : 'playwright');
for (const engine of (process.env.HIDI_BROWSER_ENGINES || 'chromium,firefox,webkit').split(',')) {
  console.log(`Running privacy editor regression in ${engine}`);
  const fixture = await privacyFixture();
  const browser = await playwright[engine].launch({ headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await context.newPage();
    page.setDefaultTimeout(15000);
    await page.goto(fixture.url + '/admin/privacy-policy');
    await page.locator('#status').filter({ hasText: 'Staff sign-in required' }).waitFor();
    assert.equal(await page.locator('[name=businessName]').isDisabled(), true);
    await context.addCookies([{ name: 'fixture_role', value: 'OWNER', url: fixture.url }]);
    await page.reload(); await page.locator('#status').filter({ hasText: 'Owner verified' }).waitFor();
    assert.equal(await page.locator('[name=businessName]').inputValue(), 'High D Higher Dimensions');
    assert.equal(await page.locator('[name=address]').inputValue(), '');
    assert.equal(await page.locator('#publish').isDisabled(), true);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.locator('[name=address]').fill('123 Test Road, Hyderabad, Telangana, India 500001');
    await page.locator('button[type=submit]').click(); await page.locator('#status').filter({ hasText: 'Draft saved privately' }).waitFor();
    assert.equal((await context.request.get(fixture.url + '/privacy')).status(), 404);
    await page.reload(); await page.locator('#status').filter({ hasText: 'Owner verified' }).waitFor();
    assert.ok((await page.locator('[name=address]').inputValue()).includes('Test Road'));
    const popupPromise = page.waitForEvent('popup'); await page.locator('#preview').click(); const preview = await popupPromise;
    await preview.waitForLoadState(); assert.ok((await preview.locator('body').innerText()).includes('ADMIN PREVIEW')); await preview.close();
    await page.locator('[name=officerName]').fill('Fixture Officer, Grievance Officer');
    await page.locator('[name=officerEmail]').fill('privacy@hidi.test');
    await page.locator('[name=officerPhone]').fill('+91 9000000000');
    await page.locator('[name=effectiveDate]').fill('2026-01-01');
    for (const textarea of await page.locator('.section-text').all()) {
      const text = await textarea.inputValue(); await textarea.fill(text.replace(/\[[^\]]+\]/g, 'Reviewed disclosure for this local browser fixture.'));
    }
    await page.locator('button[type=submit]').click(); await page.locator('#status').filter({ hasText: 'Draft saved privately' }).waitFor();
    assert.equal(await page.locator('#problems li').count(), 0);
    await page.locator('#approved').check(); assert.equal(await page.locator('#publish').isEnabled(), true);
    page.once('dialog', dialog => dialog.accept()); await page.locator('#publish').click(); await page.locator('#status').filter({ hasText: 'Policy published.' }).waitFor();
    assert.equal((await context.request.get(fixture.url + '/privacy')).status(), 200);
    assert.equal(await page.locator('#history a').count(), 1);
    await page.goto(fixture.url + '/fixture-links');
    assert.equal(await page.locator('nav a[href="/admin/privacy-policy"]').count(), 1);
    assert.equal(await page.locator('footer.footer a[href="/privacy"]').count(), 1);
    await page.getByRole('button', { name: 'Returns', exact: true }).click(); assert.equal(await page.evaluate(() => window.otherPolicy), true);
    await page.locator('footer.site-footer a[href="/privacy"]').click(); await page.waitForURL('**/privacy');
    assert.ok((await page.locator('body').innerText()).includes('Version 1'));
    console.log(`PASS ${engine}: owner gate, mobile editor, private saved draft, preview, publish guard, history and both footer links`);
    await context.close();
  } finally { await browser.close(); await fixture.close(); }
}
