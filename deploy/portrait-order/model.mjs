export const DRESSES = Object.freeze([
  {id:'DSC01671',name:'Pink embroidered kurta',title:'Her softer side.',caption:'A little softness for your everyday.'},
  {id:'DSC01431',name:'Yellow floral kurta',title:'Her little sunshine.',caption:'A brighter mood. A moment of your own.'},
  {id:'DSC01567',name:'Orange embroidered kurta',title:'Her spirited side.',caption:'For the days you feel like going further.'},
  {id:'DSC01529',name:'Wine embroidered kurta',title:'Her bold moments.',caption:'For the confidence you carry with you.'},
  {id:'DSC01849',name:'Red floral embroidered kurta',title:'Her quiet confidence.',caption:'A little courage, in your own way.'},
].map(item=>Object.freeze({...item,url:'/assets/images/ananya-portraits/'+item.id+'.jpg'})));
export const DEFAULT_ORDER = Object.freeze(DRESSES.map(item=>item.id));
export function validOrder(order) {
  return Array.isArray(order) && order.length===5 && new Set(order).size===5 && order.every(id=>DEFAULT_ORDER.includes(id));
}
export function orderOrDefault(value) { return validOrder(value)?[...value]:[...DEFAULT_ORDER]; }
export function builtinGalleryActive(list) {
  return !list?.active || !list.items?.length || (list.items.length===1 && /1791693627341-da821fb4-1fad-4099-8799-c1ae965315b2\.jpg(?:$|\?)/.test(list.items[0].url));
}
