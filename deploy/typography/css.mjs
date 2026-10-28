import { fonts, validateConfig } from './registry.mjs';
export function fontFaces(assetVersion = '') {
  return Object.values(fonts).filter(font => font.file).map(font => `@font-face{font-family:${font.stack.split(',')[0]};src:url('/typography/assets/fonts/${font.file}${assetVersion ? '?v=' + assetVersion : ''}') format('woff2');font-style:normal;font-weight:${font.weight};font-display:swap}`).join('\n');
}
export function publishedCss(state) {
  let css = `:root{--hidi-typography-revision:${state.revision}}\n`;
  for (const scope of ['storefront', 'admin']) {
    const config = state.profiles[scope].published;
    if (!config) continue; // Preserve existing typography until the first explicit publication.
    const c = validateConfig(config);
    const root = `html[data-hidi-type-scope="${scope}"]`;
    const family = role => fonts[c[role]].stack;
    css += `@media screen{${root}{--font-sans:${family('body')};--font-body:${family('body')};--font-display:${family('heading')};--font-product:${family('product')};--font-ui:${family('ui')}}}\n`;
    // Explicit roles beat legacy module and inline font-family declarations. Sizes,
    // spacing, icon glyphs, SVG wordmark and printed labels are intentionally untouched.
    const group = (selectors, role) => `@media screen{${selectors.map(selector => root + ' ' + selector).join(',')}{font-family:${family(role)}!important}}\n`;
    css += group(['body','body :where(p,div,span,li,td,th,label,legend,summary,small,a,input,select,textarea)'], 'body');
    css += group(['body :where(h1,h2,h3,h4,h5,h6)','body :where(h1,h2,h3,h4,h5,h6) :where(span,a,em,strong)'], 'heading');
    const product = 'body :where(.product-name,.product-title,.pdp-title,.pdp-title-row h1,[data-typography="product"],[class*="product-card"] h3,[class*="editorial-product-card"] h3)';
    css += group([product, product + ' :where(span,a,em,strong)'], 'product');
    css += group(['body :where(button,.button,[role="button"],nav a,.header-actions a,.price,.pdp-price,[data-typography="ui"])','body :where(button,.button,[role="button"],nav a) :where(span,strong)'], 'ui');
  }
  return css;
}
