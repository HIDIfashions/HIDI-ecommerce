function HidiHeroInitialSelection() {
  const value = window.__HidiHeroInitial;
  if (typeof window.__HidiAvifEnabled !== "boolean" || value?.active !== true || !["image", "video"].includes(value.type) || !HidiHeroSafeUrl(value.url)) return null;
  const items = (Array.isArray(value.items) && value.items.length ? value.items : [value]).map(item => ({
    type: item.type,
    url: HidiHeroSafeUrl(item.url),
    assetId: item.assetId,
    desktopPosition: typeof item.desktopPosition === "string" ? item.desktopPosition : "50% 50%",
    mobilePosition: typeof item.mobilePosition === "string" ? item.mobilePosition : "50% 50%"
  })).filter(item => ["image", "video"].includes(item.type) && item.url).slice(0, 20);
  return items.length ? { items, autoPlay: value.autoPlay !== false, interval: Math.max(3, Math.min(30, Number(value.intervalSeconds) || 6)) } : null;
}
