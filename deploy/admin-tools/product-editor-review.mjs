import reviewed from './product-editor-review-data.mjs';
// These are already reviewed catalogue facts, not suggested product defaults.
// Exact identity and original copy checks match the storefront's review rules.
const keys={'Neckline':'neckline','Sleeves':'sleeveLength','Top length':'topLength','Bottom length':'bottomLength','Front detail':'frontDetail','Side detail':'sideDetail','Lining':'lining'};
export const REVIEWED_DETAIL_KEYS = new Set(Object.values(keys));
export function reviewedEditorFields(product){
  const record=reviewed[product.slug];if(!record)return {};
  const codes=new Set((product.variants??[]).flatMap(variant=>Array.from(String(variant.sku??'').matchAll(/(HIDI|KUR|COR)[_-](\d{3})(?!\d)/gi),match=>`${match[1].toUpperCase()}_${match[2]}`)));
  if(codes.size!==1||!codes.has(record.styleCode)||record.productId!==product.id||record.catalogueName!==product.name||record.catalogueFabric!==(product.fabric??null)||record.catalogueDescription!==(product.description??null))return {};
  return Object.fromEntries(record.specifications.filter(spec=>keys[spec.label]).map(spec=>[keys[spec.label],spec.value]));
}
