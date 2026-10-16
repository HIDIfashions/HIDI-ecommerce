import {renderHero} from './hero.mjs';
import {catalogueStatus} from '../pricing/model.mjs';
// The browser already validates this same public catalogue before showing the bar.
// Render that exact bar earlier; failures retain the existing browser fallback.
async function loadPublic(path){
 const port=Number(process.env.PORT||3000);if(!Number.isInteger(port)||port<1||port>65535)throw Error('Invalid listener');
 const origin=process.env.HIDI_PUBLIC_READ_ORIGIN||'http://127.0.0.1:'+port;
 if(!/^http:\/\/127\.0\.0\.1:\d+$/.test(origin))throw Error('Public reads must remain on loopback');
 const response=await fetch(origin+path,{cache:'no-store',signal:AbortSignal.timeout(1200)});
 if(!response.ok)throw Error('Catalogue unavailable');return response.json();
}
export async function renderAnnouncement(html,loadProducts=()=>loadPublic('/api/store/products')){
 try{
  if(/<aside\b[^>]*data-hidi-price-announcement/.test(html))return html;
  const products=await loadProducts();if(!Array.isArray(products)||!catalogueStatus(products).ready)return html;
  const bar='<aside class="hidi-price-announcement" data-hidi-price-announcement="true" aria-label="HIDI price offer">15% off across HIDI · Prices already reduced · No code needed</aside>';
  return html.replace(/<body\b[^>]*>/i,tag=>tag+bar);
 }catch{return html;}
}

export async function renderInitialHome(html){
 const [products,hero]=await Promise.all(['/api/store/products','/api/hidi/hero-config'].map(path=>loadPublic(path).catch(()=>null)));
 return renderHero(await renderAnnouncement(html,async()=>products),hero);
}
