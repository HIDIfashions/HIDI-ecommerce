import { fonts, fontSources, validateConfig, roles, sizeDevices } from './registry.mjs';
export function fontFaces(assetVersion = '', ids = Object.keys(fonts)) {
  return [...new Set(ids)].flatMap(id => {const font=fonts[id];return fontSources(font).map(face => `@font-face{font-family:${font.stack.split(',')[0]};src:url('/typography/assets/fonts/${face.file}${assetVersion ? '?v=' + assetVersion : ''}') format('woff2');font-style:normal;font-weight:${face.weight};font-display:swap}`);}).join('\n');
}
export function publishedCss(state) {
  let css = `:root{--hidi-typography-revision:${state.revision}}\n`;
  // Open tabs can still have an older fonts.css after a library upgrade.
  // Deliver the selected faces atomically with the published family settings.
  const selected = Object.values(state.profiles).flatMap(profile => profile.published ? roles.map(role=>validateConfig(profile.published)[role]) : []).filter(id => !['system','inter','lora','manrope'].includes(id));
  if (selected.length) css += fontFaces('', selected) + '\n';
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
    if(c.sizes){
      // Blank values emit no rule, preserving the original responsive typography.
      // Mobile and desktop rules are disjoint so either can remain at site defaults.
      const targets={
        heading:['body :where(h1,.page-title,[data-typography="heading"])'],
        body:['body','body :where(p,li,td,th,label,legend,summary,input,select,textarea)'],
        product:[product,product+' :where(span,a,em,strong)'],
        ui:['body :where(button,.button,[role="button"],nav a,.header-actions a,.price,.pdp-price,[data-typography="ui"])','body :where(button,.button,[role="button"],nav a) :where(span,strong)']
      };
      for(const device of sizeDevices){const rules=roles.filter(role=>c.sizes[device][role]!==null).map(role=>targets[role].map(selector=>root+' '+selector).join(',')+'{font-size:'+c.sizes[device][role]+'px!important}').join('');
        if(rules)css+='@media screen and ('+(device==='mobile'?'max-width:700px':'min-width:701px')+'){'+rules+'}\n';}
    }
  }
  return css;
}
