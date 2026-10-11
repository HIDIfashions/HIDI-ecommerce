/** Keep the canonical storefront regression, including the current collapsible summary. */
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';

export async function probe(base,output){
  let source=await readFile(new URL('../button-states/revert-probes.mjs',import.meta.url),'utf8');
  const old="page.locator('.checkout-summary').innerText()";
  assert.equal(source.split(old).length-1,2,'Expected two retained shipping/total summary assertions');
  source=source.replaceAll(old,"page.locator('.checkout-summary').textContent()");
  const anchor="await primaryPalette(page.getByRole('link',{name:'Sign In',exact:true}),'Checkout Sign In');";
  assert.equal(source.split(anchor).length-1,1);
  // Shipping must first be disclosed visibly. Subsequent assertions inspect
  // its retained amount after the customer intentionally collapses the panel.
  source=source.replace(anchor,anchor+`
        if(viewport.width<=720&&await page.locator('.checkout-mobile-summary').count())assert(await page.locator('.checkout-mobile-summary').evaluate(element=>element.open),'Charged shipping opens the mobile summary by default');
        const visibleShipping=page.locator(viewport.width<=720?'.checkout-mobile-shipping-row':'.checkout-summary');
        await visibleShipping.waitFor({state:'visible'});
        assert.match(await visibleShipping.innerText(),/Shipping\\s*₹99/,'Shipping fee is visible before the customer collapses the summary');
  `);
  source=source.replace("from './request-policy.mjs'","from '../button-states/request-policy.mjs'");
  const generated=new URL('./retained-generated.mjs',import.meta.url);
  await writeFile(generated,source);
  const retained=await import(generated.href);
  const report=await retained.probe(base,output);
  report.shippingDisclosureBeforeCollapse=true;
  await writeFile(join(output,'report.json'),JSON.stringify(report,null,2));
  return report;
}
