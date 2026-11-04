import assert from 'node:assert/strict';

export async function checkCollection(page) {
  const heading = page.locator('.collection-header h1');
  assert.equal(await heading.count(), 1);
  assert(await heading.isVisible());
  assert.equal(await page.locator('.collection-header p').count(), 0);
  assert.equal(await page.locator('.hidi-collection-intro').count(), 0);
  const first = page.locator('main article').first();
  const geometry = await heading.evaluate((el) => {
    const h=el.getBoundingClientRect(), card=document.querySelector('main article').getBoundingClientRect();
    return {x:h.x,cardX:card.x,headingHeight:h.height,gap:card.top-h.bottom,width:innerWidth,font:parseFloat(getComputedStyle(el).fontSize),overflow:document.documentElement.scrollWidth>innerWidth+1};
  });
  assert(Math.abs(geometry.x-geometry.cardX)<=8, 'Heading aligns with product grid: '+JSON.stringify(geometry));
  assert(geometry.gap<140,'Products begin close to heading');
  assert(geometry.font<=28&&geometry.font>=21,'Modest readable heading');
  assert(!geometry.overflow);
  if(new URL(page.url()).pathname==='/collections/all') {
    assert.equal((await heading.innerText()).trim(),'Shop All');
    assert.equal(await page.locator('.hidi-collection-guidance').count(),0);
    assert.equal(await page.getByText('Discover HIDI kurta sets',{exact:true}).count(),0);
  }
  assert.equal(await page.locator('body').evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(243, 235, 221)');
  assert(await first.isVisible());
}

export async function checkProductDetails(page) {
  assert.equal(await page.locator('body').evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(243, 235, 221)');
  const group=page.locator('[data-hidi-product-details]');await group.waitFor();
  assert.deepEqual(await group.locator('summary').allTextContents(),['Fabric & design','What’s included','Size & fit','Care instructions','Delivery & returns']);
  assert.equal(await page.locator('[aria-label="Product quality and fit summary"]').count(),0);
  assert.equal(await page.locator('summary').getByText('Product description',{exact:true}).count(),0);
  for(const key of ['fabric','pieces','sizing','care','delivery']) {
    const detail=group.locator('[data-product-detail="'+key+'"]');
    if(await detail.evaluate(el=>el.open))await detail.locator('summary').click();
    await detail.locator('summary').focus();await page.keyboard.press('Enter');
    assert(await detail.evaluate(el=>el.open), key+' opens using keyboard');
    if(key==='delivery')assert.equal(await detail.getByRole('link').getAttribute('href'),'/returns#shipping-returns-exchange');
    await detail.locator('summary').click();assert.equal(await detail.evaluate(el=>el.open),false);
  }
  const sizing=group.locator('[data-product-detail="sizing"]');await sizing.locator('summary').click();
  await sizing.getByRole('button',{name:'Size & fit guide',exact:true}).click();
  await page.getByRole('region',{name:'HIDI size and fit guide'}).waitFor();
  await page.locator('.pdp-purchase .size-row-title button[aria-controls]').click();
  await sizing.locator('summary').click();
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Product has no horizontal overflow');
  await group.locator('[data-product-detail="fabric"] summary').click();
}
