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
  'bodoni-moda': { name: 'Bodoni Moda', stack: '"HIDI Bodoni Moda", Georgia, serif', file: 'bodoni-moda.woff2', weight: '400 900' },
  'dm-serif-display': { name: 'DM Serif Display', stack: '"HIDI DM Serif Display", Georgia, serif', file: 'dm-serif-display-400.woff2', weight: '400' },
  prata: { name: 'Prata', stack: '"HIDI Prata", Georgia, serif', file: 'prata-400.woff2', weight: '400' },
  italiana: { name: 'Italiana', stack: '"HIDI Italiana", Georgia, serif', file: 'italiana-400.woff2', weight: '400' },
  fraunces: { name: 'Fraunces', stack: '"HIDI Fraunces", Georgia, serif', file: 'fraunces.woff2', weight: '100 900' },
  merriweather: { name: 'Merriweather', stack: '"HIDI Merriweather", Georgia, serif', file: 'merriweather.woff2', weight: '300 900' },
  outfit: { name: 'Outfit', stack: '"HIDI Outfit", Arial, sans-serif', file: 'outfit.woff2', weight: '100 900' },
  raleway: { name: 'Raleway', stack: '"HIDI Raleway", Arial, sans-serif', file: 'raleway.woff2', weight: '100 900' },
  'work-sans': { name: 'Work Sans', stack: '"HIDI Work Sans", Arial, sans-serif', file: 'work-sans.woff2', weight: '100 900' },
  'plus-jakarta-sans': { name: 'Plus Jakarta Sans', stack: '"HIDI Plus Jakarta Sans", Arial, sans-serif', file: 'plus-jakarta-sans.woff2', weight: '200 800' },
  urbanist: { name: 'Urbanist', stack: '"HIDI Urbanist", Arial, sans-serif', file: 'urbanist.woff2', weight: '100 900' },
  lato: { name: 'Lato', stack: '"HIDI Lato", Arial, sans-serif', faces: [100,300,400,700,900].map(weight=>({file:`lato-${weight}.woff2`,weight:String(weight)})) },
});
export const fontSources = font => font.faces || (font.file ? [{file:font.file,weight:font.weight}] : []);
export const presets = Object.freeze({
  classic: { heading: 'system', body: 'system', product: 'system', ui: 'system' },
  editorial: { heading: 'lora', body: 'inter', product: 'lora', ui: 'inter' },
  modern: { heading: 'manrope', body: 'inter', product: 'manrope', ui: 'inter' },
  retail: { heading: 'lato', body: 'lato', product: 'lato', ui: 'lato' },
});
export const sizeLimits = Object.freeze({heading:[18,72],body:[12,24],product:[12,40],ui:[12,24]});
export const sizeDevices = ['desktop','mobile'];
export function emptySizes(){return Object.fromEntries(sizeDevices.map(device=>[device,Object.fromEntries(roles.map(role=>[role,null]))]));}
export function validateSizes(value){
  const bad=()=>{throw Object.assign(new Error('Use whole-pixel font sizes within the displayed limits, or leave them blank.'),{status:400});};
  if(!value||Array.isArray(value)||typeof value!=='object'||Object.keys(value).length!==2||!sizeDevices.every(device=>Object.hasOwn(value,device)))bad();
  const result=emptySizes();
  for(const device of sizeDevices){const row=value[device];if(!row||Array.isArray(row)||typeof row!=='object'||Object.keys(row).length!==roles.length||!roles.every(role=>Object.hasOwn(row,role)))bad();
    for(const role of roles){const n=row[role],[min,max]=sizeLimits[role];if(n!==null&&(!Number.isInteger(n)||n<min||n>max))bad();result[device][role]=n;}}
  return result;
}
export function validateConfig(value) {
  if (!value || Array.isArray(value) || typeof value !== 'object' || Object.keys(value).some(key=>!roles.includes(key)&&key!=='sizes') || !roles.every(role => Object.hasOwn(value,role)&&typeof value[role] === 'string' && Object.hasOwn(fonts, value[role]))) {
    throw Object.assign(new Error('Choose an available font for each typography role.'), { status: 400 });
  }
  return {...Object.fromEntries(roles.map(role => [role, value[role]])),...(Object.hasOwn(value,'sizes')?{sizes:validateSizes(value.sizes)}:{})};
}
