/** Retain canonical commerce assertions; support the current campaign home and collapsible summary. */
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
  const homeAnchor='async function originalHomePalette(){';
  assert.equal(source.split(homeAnchor).length-1,1);
  source=source.replace(homeAnchor,homeAnchor+`
        // The live campaign home replaced the old button--gold/burgundy CTAs.
        // Preserve the original assertions below for releases that still use them.
        if(!await page.locator('.button:visible').count()){
          const shop=page.locator('.campaign-shop-button:visible');await shop.waitFor();
          const current=await shop.evaluate(e=>{const c=getComputedStyle(e);return{background:c.backgroundColor,color:c.color,border:c.borderTopColor};});
          assert.deepEqual(current,{background:'rgba(255, 250, 244, 0.18)',color:'rgb(255, 254, 247)',border:'rgba(255, 250, 244, 0.44)'},'Current campaign Shop Now retains its public stylesheet palette');
          return;
        }
  `);
  const generated=new URL('./commerce-generated.mjs',import.meta.url);
  await writeFile(generated,source);
  const retained=await import(generated.href);
  const report=await retained.probe(base,output);
  report.shippingDisclosureBeforeCollapse=true;
  report.currentCampaignHomePalette=true;
  await writeFile(join(output,'report.json'),JSON.stringify(report,null,2));
  return report;
}
