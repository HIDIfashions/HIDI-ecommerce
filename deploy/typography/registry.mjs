export const roles = ['heading', 'body', 'product', 'ui'];
export const fonts = Object.freeze({
  system: { name: 'System sans', stack: '"Helvetica Neue", "Segoe UI", Arial, sans-serif' },
  inter: { name: 'Inter', stack: '"HIDI Inter", Arial, sans-serif', file: 'inter.woff2', weight: '100 900' },
  lora: { name: 'Lora', stack: '"HIDI Lora", Georgia, serif', file: 'lora.woff2', weight: '400 700' },
  manrope: { name: 'Manrope', stack: '"HIDI Manrope", Arial, sans-serif', file: 'manrope.woff2', weight: '200 800' },
});
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
