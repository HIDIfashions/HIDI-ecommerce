function HidiMediaVideo(value) {
  const item = HidiMediaManifest.videos[HidiMediaPath(value)];
  if (!item) return value;
  const variant = matchMedia('(max-width: 700px)').matches ? item.mobile : item.desktop;
  try {
    if (variant.av1Url && HidiMediaVideo.av1 !== false && document.createElement('video').canPlayType('video/mp4; codecs="'+(variant.av1Codec || 'av01.0.05M.08,mp4a.40.2')+'"')) return variant.av1Url;
  } catch {}
  return variant.url;
}
function HidiMediaVideoFallback(event, value, fail) {
  const video = event.currentTarget;
  const item = HidiMediaManifest.videos[HidiMediaPath(value)];
  const variant = item && (matchMedia('(max-width: 700px)').matches ? item.mobile : item.desktop);
  if (video && variant?.av1Url && HidiMediaPath(video.currentSrc || video.src) === HidiMediaPath(variant.av1Url) && !video.dataset.hidiAv1Fallback) {
    video.dataset.hidiAv1Fallback = 'true';
    HidiMediaVideo.av1 = false;
    video.src = variant.url;
    video.load();
    if (video.autoplay) video.play().catch(() => {});
    return;
  }
  fail();
}
