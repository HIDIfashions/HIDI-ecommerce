function HidiHeroSaveData() {
  return typeof navigator !== "undefined" && Boolean(navigator.connection?.saveData);
}
function HidiHeroComponent() {
  const { openCollection, dialogOpen } = HidiHeroContext();
  const mobile = HidiHeroQuery("(max-width: 700px)");
  const reduced = HidiHeroReduced();
  const pageVisible = HidiHeroVisible();
  const videoRef = HidiHeroReact.useRef(null);
  const heroRef = HidiHeroReact.useRef(null);
  const heroVisible = HidiHeroInView(heroRef);
  const [userPaused, setUserPaused] = HidiHeroReact.useState(() => reduced || HidiHeroSaveData());
  const [readySource, setReadySource] = HidiHeroReact.useState("");
  const [liveItems, setLiveItems] = HidiHeroReact.useState([]);
  const [heroAutoPlay, setHeroAutoPlay] = HidiHeroReact.useState(true);
  const [heroInterval, setHeroInterval] = HidiHeroReact.useState(6);
  const [failedSource, setFailedSource] = HidiHeroReact.useState("");
  const liveVideoRef = HidiHeroReact.useRef(null);
  const [soundEnabled, setSoundEnabled] = HidiHeroReact.useState(false);
  const [manualPlayback, setManualPlayback] = HidiHeroReact.useState(false);
  const [heroConfigStatus, setHeroConfigStatus] = HidiHeroReact.useState("loading");
  const [liveReadySource, setLiveReadySource] = HidiHeroReact.useState("");
  const [videoAllowed, setVideoAllowed] = HidiHeroReact.useState(false);
  const variant = mobile ? "mobile" : "desktop";
  const source = HidiHeroAsset(`video/hidi-hero-${variant}-luminous-v1.mp4`);
  const poster = HidiHeroAsset(`images/hero-${variant}-luminous-first-frame-v1.webp`);
  const sequence = HidiHeroSequence({ items: liveItems, autoPlay: heroAutoPlay, intervalSeconds: heroInterval, readySource: liveReadySource, visible: heroVisible && pageVisible && !dialogOpen });
  const liveHero = liveItems[sequence.index] || null;
  const liveFailed = Boolean(liveHero && failedSource === liveHero.url);
  const showBundled = heroConfigStatus === "bundled";
  const liveReady = Boolean(liveHero && liveReadySource === liveHero.url);
  const ready = showBundled && readySource === source;
  const shouldPlay = showBundled && videoAllowed && !userPaused && heroVisible && pageVisible && !dialogOpen;
  HidiHeroReact.useEffect(() => {
    let disposed = false;
    let controller;
    let timeout;
    let retryTimer;
    let attempts = 0;
    const loadSelection = async () => {
      attempts += 1;
      controller = new AbortController();
      timeout = window.setTimeout(() => controller.abort(), 8e3);
      try {
        const response = await fetch("/api/hidi/hero-config", {
          cache: "no-store",
          signal: controller.signal
        });
        if (!response.ok) throw new Error("Hero configuration unavailable");
        const value = await response.json();
        if (disposed) return;
        if (value?.active === false && value?.source === "bundled") {
          setHeroConfigStatus("bundled");
          return;
        }
        const url = value?.active === true && ["image", "video"].includes(value.type) ? HidiHeroSafeUrl(value.url) : "";
        if (!url) throw new Error("Invalid hero configuration");
        setLiveReadySource("");
        const items = (Array.isArray(value.items) && value.items.length ? value.items : [value]).map((item) => ({
          type: item.type,
          url: HidiHeroSafeUrl(item.url),
          assetId: item.assetId,
          desktopPosition: typeof item.desktopPosition === "string" ? item.desktopPosition : "50% 50%",
          mobilePosition: typeof item.mobilePosition === "string" ? item.mobilePosition : "50% 50%"
        })).filter((item) => ["image", "video"].includes(item.type) && item.url).slice(0, 20);
        if (!items.length) throw new Error("Invalid hero media list");
        setLiveItems(items);
        setHeroAutoPlay(value.autoPlay !== false);
        setHeroInterval(Math.max(3, Math.min(30, Number(value.intervalSeconds) || 6)));
        setHeroConfigStatus("uploaded");
      } catch {
        if (disposed) return;
        if (attempts < 3) retryTimer = window.setTimeout(loadSelection, attempts * 500);
        else setHeroConfigStatus("error");
      } finally {
        window.clearTimeout(timeout);
      }
    };
    void loadSelection();
    return () => {
      disposed = true;
      window.clearTimeout(timeout);
      window.clearTimeout(retryTimer);
      controller?.abort();
    };
  }, []);
  HidiHeroReact.useEffect(() => {
    setUserPaused(reduced || HidiHeroSaveData());
  }, [reduced]);
  HidiHeroReact.useEffect(() => {
    if (!showBundled || reduced || HidiHeroSaveData()) {
      setVideoAllowed(false);
      return void 0;
    }
    setVideoAllowed(false);
    let idleId = null;
    const delay = mobile ? 300 : 1200;
    const timer = window.setTimeout(() => {
      if (typeof window.requestIdleCallback === "function") {
        idleId = window.requestIdleCallback(() => setVideoAllowed(true), { timeout: 900 });
      } else {
        setVideoAllowed(true);
      }
    }, delay);
    return () => {
      window.clearTimeout(timer);
      if (idleId !== null && typeof window.cancelIdleCallback === "function") {
        window.cancelIdleCallback(idleId);
      }
    };
  }, [showBundled, mobile, reduced]);
  HidiHeroReact.useEffect(() => {
    if (!showBundled) return void 0;
    const video = videoRef.current;
    if (!video) return void 0;
    let cancelled = false;
    let videoFrame = null;
    let animationFrame = 0;
    const reveal = () => {
      if (!cancelled && video.readyState >= 2 && video.videoWidth > 0) setReadySource(source);
    };
    const queueFrame = () => {
      if (video.readyState < 2) return;
      if (typeof video.requestVideoFrameCallback === "function") {
        if (videoFrame !== null) video.cancelVideoFrameCallback?.(videoFrame);
        videoFrame = video.requestVideoFrameCallback(() => {
          videoFrame = null;
          reveal();
        });
      }
      window.cancelAnimationFrame(animationFrame);
      animationFrame = window.requestAnimationFrame(() => {
        animationFrame = window.requestAnimationFrame(() => {
          if (videoFrame === null || !video.paused || video.currentTime > 0) reveal();
        });
      });
    };
    video.addEventListener("loadeddata", queueFrame);
    video.addEventListener("playing", queueFrame);
    if (video.readyState >= 2) queueFrame();
    return () => {
      cancelled = true;
      if (videoFrame !== null) video.cancelVideoFrameCallback?.(videoFrame);
      window.cancelAnimationFrame(animationFrame);
      video.removeEventListener("loadeddata", queueFrame);
      video.removeEventListener("playing", queueFrame);
    };
  }, [showBundled, source]);
  HidiHeroReact.useEffect(() => {
    if (!showBundled) return void 0;
    const video = videoRef.current;
    if (!video) return void 0;
    let cancelled = false;
    if (!shouldPlay) {
      video.pause();
      return void 0;
    }
    video.muted = true;
    video.defaultMuted = true;
    if (video.getAttribute("src") !== source || video.error) {
      video.src = source;
      video.load();
    }
    video.play().catch(() => {
      if (!cancelled) setReadySource("");
    });
    return () => {
      cancelled = true;
      video.pause();
    };
  }, [showBundled, shouldPlay, source]);
  HidiHeroReact.useEffect(() => {
    const video = liveVideoRef.current;
    if (!video) return void 0;
    if ((reduced || HidiHeroSaveData()) && !manualPlayback || sequence.paused || !heroVisible || !pageVisible || dialogOpen) video.pause();
    else video.play().catch(() => {
      if (soundEnabled) {
        video.muted = true;
        setSoundEnabled(false);
        video.play().catch(() => {
        });
      }
    });
    return () => video.pause();
  }, [liveHero?.url, reduced, sequence.paused, heroVisible, pageVisible, dialogOpen, soundEnabled, manualPlayback]);
  const toggleSound = async () => {
    const video = liveVideoRef.current;
    if (!video) return;
    const enabled = !soundEnabled;
    setManualPlayback(true);
    video.muted = !enabled;
    setSoundEnabled(enabled);
    try {
      await video.play();
    } catch {
      video.muted = true;
      setSoundEnabled(false);
      video.play().catch(() => {
      });
    }
  };
  const revealLiveVideo = (event) => {
    const video = event.currentTarget;
    if (video.readyState >= 2 && video.videoWidth > 0) setLiveReadySource(liveHero.url);
  };
  return /* @__PURE__ */ HidiHeroReact.createElement("section", { ref: heroRef, className: "hero hero--campaign", "aria-labelledby": "hero-title", "aria-busy": heroConfigStatus === "loading", ...sequence.handlers }, /* @__PURE__ */ HidiHeroReact.createElement("div", { className: "hero-media", "aria-hidden": "true", "data-hero-config-status": liveFailed ? "error" : heroConfigStatus, "data-media-index": sequence.index, "data-frame-ready": ready || liveReady || void 0 }, heroConfigStatus === "uploaded" && liveHero && !liveFailed ? liveHero.type === "video" ? /* @__PURE__ */ HidiHeroReact.createElement(
    "video",
    {
      key: liveHero.url,
      className: "hero-live-media",
      ref: liveVideoRef,
      src: liveHero.url,
      autoPlay: (!reduced || manualPlayback) && !sequence.paused && heroVisible && pageVisible && !dialogOpen,
      muted: !soundEnabled,
      loop: liveItems.length === 1,
      onEnded: sequence.ended,
      playsInline: true,
      preload: "auto",
      onLoadedData: revealLiveVideo,
      onCanPlay: revealLiveVideo,
      onError: () => setFailedSource(liveHero.url),
      style: { visibility: liveReady ? "visible" : "hidden", "--hero-position-desktop": liveHero.desktopPosition, "--hero-position-mobile": liveHero.mobilePosition }
    }
  ) : /* @__PURE__ */ HidiHeroReact.createElement(
    "img",
    {
      key: liveHero.url,
      className: "hero-live-media",
      src: liveHero.url,
      alt: "",
      loading: "eager",
      fetchPriority: "high",
      onLoad: (event) => {
        const image = event.currentTarget;
        const selectedUrl = liveHero.url;
        const show = () => {
          if (image.isConnected && image.naturalWidth > 0) setLiveReadySource(selectedUrl);
        };
        if (typeof image.decode === "function") image.decode().then(show).catch(() => {
          if (image.isConnected) setFailedSource(selectedUrl);
        });
        else show();
      },
      onError: () => setFailedSource(liveHero.url),
      style: { visibility: liveReady ? "visible" : "hidden", "--hero-position-desktop": liveHero.desktopPosition, "--hero-position-mobile": liveHero.mobilePosition }
    }
  ) : showBundled ? /* @__PURE__ */ HidiHeroReact.createElement(HidiHeroReact.Fragment, null, /* @__PURE__ */ HidiHeroReact.createElement("picture", null, /* @__PURE__ */ HidiHeroReact.createElement("source", { media: "(max-width: 700px)", srcSet: HidiHeroAsset("images/hero-mobile-luminous-first-frame-v1.webp") }), /* @__PURE__ */ HidiHeroReact.createElement(
    "img",
    {
      className: "hero-poster",
      src: HidiHeroAsset("images/hero-desktop-luminous-first-frame-v1.webp"),
      alt: "",
      width: "1920",
      height: "1080",
      loading: "eager",
      fetchPriority: "high"
    }
  )), /* @__PURE__ */ HidiHeroReact.createElement(
    "video",
    {
      key: source,
      ref: videoRef,
      id: "hero-video",
      className: `hero-video${ready ? " is-ready" : ""}`,
      poster,
      loop: true,
      muted: true,
      playsInline: true,
      preload: shouldPlay ? "auto" : "none",
      tabIndex: -1,
      onError: () => {
        setReadySource("");
        setUserPaused(true);
      }
    }
  )) : null), /* @__PURE__ */ HidiHeroReact.createElement("div", { className: "hero-shade" }), /* @__PURE__ */ HidiHeroReact.createElement(HidiHeroControls, { items: liveItems, sequence, label: "hero media" }), heroConfigStatus === "uploaded" && liveHero?.type === "video" && !liveFailed ? /* @__PURE__ */ HidiHeroReact.createElement("button", { type: "button", className: "hero-sound-toggle", title: soundEnabled ? "Mute sound" : "Turn sound on", "aria-label": soundEnabled ? "Mute video sound" : "Turn video sound on", "aria-pressed": soundEnabled, onClick: toggleSound }, /* @__PURE__ */ HidiHeroReact.createElement("svg", { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "1.7", strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": "true", focusable: "false" }, /* @__PURE__ */ HidiHeroReact.createElement("path", { d: "m11 5-5 4H3v6h3l5 4V5Z" }), soundEnabled ? /* @__PURE__ */ HidiHeroReact.createElement("path", { d: "M15 8a5 5 0 0 1 0 8m3-11a9 9 0 0 1 0 14" }) : /* @__PURE__ */ HidiHeroReact.createElement("path", { d: "m16 9 5 6m0-6-5 6" }))) : null, /* @__PURE__ */ HidiHeroReact.createElement("h1", { id: "hero-title", className: "sr-only" }, "HIDI \u2014 Wear the feeling. Indian wear for work, everyday and occasions."), /* @__PURE__ */ HidiHeroReact.createElement("div", { className: "campaign-hero-action" }, /* @__PURE__ */ HidiHeroReact.createElement("button", { type: "button", className: "campaign-shop-button", onClick: () => openCollection() }, "Shop Now")));
}
