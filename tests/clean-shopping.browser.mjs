import { checkCollection, checkProductDetails } from './clean-shopping-checks.mjs';
export async function runCleanShoppingChecks({browser,engine,scenario,products,until}) {
  for(const width of [320,390,768,1440]) {
    await scenario(browser,engine,'CLEAN-COLLECTION-'+width,'Approved collection layout and accessible below-grid guidance',async page=>{
      await page.locator('main article').first().waitFor();
      await checkCollection(page);
    },{startPath:'/collections/all',viewport:{width,height:900}});
    await scenario(browser,engine,'CLEAN-PRODUCT-'+width,'Five sections retain catalogue facts and link to the existing size guide',async page=>{
      await page.locator('[data-hidi-react-pdp][data-hidi-hydrated="true"]').waitFor();
      await checkProductDetails(page);
    },{startPath:'/products/'+products[0].slug,viewport:{width,height:900}});
  }
}
