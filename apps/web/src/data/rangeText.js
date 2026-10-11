const RANGE_TEXT_DEFAULTS = {"version":1,"eyebrow":"A WARDROBE FOR EVERY YOU","heading":"Explore our","accent":"range.","subtitle":"Your next favourite is waiting to be found.","footer":"A little preview of what’s inside.","buttonLabel":"Explore the collections","cards":{"range-everyday":{"title":"Casual Wear"},"range-work-edit":{"title":"Work Wear"},"range-occasion":{"title":"Occasional Wear"},"range-new-arrivals":{"title":"Ananya’s Pick"},"range-shop-all":{"title":"Ananya’s Pick"}}};
const RANGE_TEXT_LIMITS = {eyebrow:80,heading:80,accent:40,subtitle:200,footer:160,buttonLabel:60};
function publicRangeText(raw) {
  const result={version:1,cards:{}};
  for(const [key,limit] of Object.entries(RANGE_TEXT_LIMITS)) result[key]=typeof raw?.[key]==="string" && raw[key].length<=limit ? raw[key] : RANGE_TEXT_DEFAULTS[key];
  for(const id of Object.keys(RANGE_TEXT_DEFAULTS.cards)) result.cards[id]={title:typeof raw?.cards?.[id]?.title==="string" && raw.cards[id].title.trim() && raw.cards[id].title.length<=60 ? raw.cards[id].title : RANGE_TEXT_DEFAULTS.cards[id].title};
  return result;
}

export { RANGE_TEXT_DEFAULTS, publicRangeText };
