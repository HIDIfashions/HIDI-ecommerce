// Preserve every rule and resolve stylesheet-relative resources against HIDI,
// including query strings and fragments. A CDN stylesheet must not move fonts
// or photographs to the asset host.
export function normalizeStyleUrls(css,href,absolute=false){
 const base=new URL(href,'https://hidiindia.com/');
 if(absolute)return css.replace(/url\(\s*(?:"([^"]*)"|'([^']*)'|([^'"\s)]+))\s*\)/gi,(whole,double,single,plain)=>{
  const value=double??single??plain;
  return /^(?:data:|https?:|#)/i.test(value)?whole:'url('+JSON.stringify(new URL(value,base).href)+')';
 });
 return css.replace(/url\(\s*(['"]?)([^'"\s)]+)\1\s*\)/gi,(whole,quote,value)=>{
  if(/^(?:data:|https?:|#)/i.test(value)||!absolute&&value.startsWith('/'))return whole;
  const url=new URL(value,base);
  return 'url('+JSON.stringify(absolute?url.href:url.pathname)+')';
 });
}
