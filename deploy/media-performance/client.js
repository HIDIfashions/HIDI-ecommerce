function HidiMediaPath(value) {
  try { const url = new URL(value, location.origin); return url.origin === location.origin || ["hidiindia.com", "www.hidiindia.com"].includes(url.hostname) ? url.pathname : ""; } catch { return ""; }
}
function HidiMediaVideo(value) {
  const item = HidiMediaManifest.videos[HidiMediaPath(value)];
  return item ? (matchMedia("(max-width: 700px)").matches ? item.mobile.url : item.desktop.url) : value;
}
function HidiMediaPoster(value) {
  const item = HidiMediaManifest.videos[HidiMediaPath(value)];
  return item ? (matchMedia("(max-width: 700px)").matches ? item.mobile.poster : item.desktop.poster) : undefined;
}
function HidiMediaImageProps(props) {
  const item = HidiMediaManifest.images[HidiMediaPath(props.src)];
  if (!item) return props;
  const landingCard = Boolean(props["data-landing-media-slot"]);
  return { ...props, src: item.variants.find(v => v.width >= 960)?.url || item.variants.at(-1).url,
    srcSet: item.variants.map(v => v.url + " " + v.width + "w").join(", "),
    sizes: props.sizes || (landingCard ? "(max-width: 700px) 100vw, (max-width: 1100px) 50vw, 25vw" : "(max-width: 700px) 100vw, (max-width: 1100px) 60vw, 50vw"),
    "data-hidi-original-src": props.src };
}
function HidiMediaImage(props) {
  const node = HidiHeroReact.useRef(null);
  const [near, setNear] = HidiHeroReact.useState(false);
  const [failed, setFailed] = HidiHeroReact.useState(false);
  const original = props.__hidiOriginal;
  const high = original.fetchPriority === "high" || /hero-live-media|hero-poster/.test(original.className || "");
  HidiHeroReact.useEffect(() => {
    if (high || typeof IntersectionObserver === "undefined") { setNear(true); return; }
    const observer = new IntersectionObserver(entries => { if (entries.some(e => e.isIntersecting)) { setNear(true); observer.disconnect(); } }, { rootMargin: "350px" });
    if (node.current) observer.observe(node.current);
    return () => observer.disconnect();
  }, [high]);
  const active = high || near;
  const out = failed ? { ...original } : HidiMediaImageProps(original);
  const priorRef = original.ref;
  out.ref = element => { node.current = element; if (typeof priorRef === "function") priorRef(element); else if (priorRef) priorRef.current = element; };
  out.loading = high ? "eager" : "lazy";
  out.decoding = "async";
  out.onLoad = event => { if (active && event.currentTarget.naturalWidth > 1) original.onLoad?.(event); };
  out.onError = event => { if (!failed) setFailed(true); else original.onError?.(event); };
  if (!active) { out.src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='1' height='1'/%3E"; delete out.srcSet; }
  return HidiHeroReact.createElement("img", out);
}
function HidiMediaCreate(create, tag, props, ...rest) {
  if (tag !== "img" || !props?.src || !HidiMediaManifest.images[HidiMediaPath(props.src)]) return create(tag, props, ...rest);
  // Keep hero readiness callbacks on the real decoded asset, including uploaded-image heroes.
  if (/hero-live-media|hero-poster/.test(props.className || "")) return create(tag, HidiMediaImageProps(props), ...rest);
  return create(HidiMediaImage, { __hidiOriginal: props }, ...rest);
}
