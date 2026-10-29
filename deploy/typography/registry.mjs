export const roles = ['heading', 'body', 'product', 'ui'];
export const fonts = Object.freeze({
  system: { name: 'System sans', stack: '"Helvetica Neue", "Segoe UI", Arial, sans-serif' },
  inter: { name: 'Inter', stack: '"HIDI Inter", Arial, sans-serif', file: 'inter.woff2', weight: '100 900' },
  lora: { name: 'Lora', stack: '"HIDI Lora", Georgia, serif', file: 'lora.woff2', weight: '400 700' },
  manrope: { name: 'Manrope', stack: '"HIDI Manrope", Arial, sans-serif', file: 'manrope.woff2', weight: '200 800' },
  'playfair-display': { name: 'Playfair Display', stack: '"HIDI Playfair Display", Georgia, serif', file: 'playfair-display.woff2', weight: '400 900' },
  'cormorant-garamond': { name: 'Cormorant Garamond', stack: '"HIDI Cormorant Garamond", Georgia, serif', file: 'cormorant-garamond.woff2', weight: '300 700' },
  'libre-baskerville': { name: 'Libre Baskerville', stack: '"HIDI Libre Baskerville", Georgia, serif', file: 'libre-baskerville.woff2', weight: '400 700' },
  poppins: { name: 'Poppins', stack: '"HIDI Poppins", Arial, sans-serif', faces: [100,200,300,400,500,600,700,800,900].map(weight=>({file:`poppins-${weight}.woff2`,weight:String(weight)})) },
  montserrat: { name: 'Montserrat', stack: '"HIDI Montserrat", Arial, sans-serif', file: 'montserrat.woff2', weight: '100 900' },
  'dm-sans': { name: 'DM Sans', stack: '"HIDI DM Sans", Arial, sans-serif', file: 'dm-sans.woff2', weight: '100 1000' },
  'nunito-sans': { name: 'Nunito Sans', stack: '"HIDI Nunito Sans", Arial, sans-serif', file: 'nunito-sans.woff2', weight: '200 1000' },
  'source-sans-3': { name: 'Source Sans 3', stack: '"HIDI Source Sans 3", Arial, sans-serif', file: 'source-sans-3.woff2', weight: '200 900' },
});
export const fontSources = font => font.faces || (font.file ? [{file:font.file,weight:font.weight}] : []);
export const presets = Object.freeze({
  classic: { heading: 'system', body: 'system', product: 'system', ui: 'system' },
  editorial: { heading: 'lora', body: 'inter', product: 'lora', ui: 'inter' },
  modern: { heading: 'manrope', body: 'inter', product: 'manrope', ui: 'inter' },
});
export function validateConfig(value) {
  if (!value || Array.isArray(value) || typeof value !== 'object' || Object.keys(value).length !== roles.length || !roles.every(role => typeof value[role] === 'string' && Object.hasOwn(fonts, value[role]))) {
    throw Object.assign(new Error('Choose an available font for each typography role.'), { status: 400 });
  }
  return Object.fromEntries(roles.map(role => [role, value[role]]));
}
