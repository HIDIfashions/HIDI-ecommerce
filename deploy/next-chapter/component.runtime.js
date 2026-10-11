function HidiNextChapterComponent() {
  const landingMedia = HidiNextChapterMedia();
  const [chapter, setChapter] = HidiNextChapterReact.useState("everyday");
  const [paused, setPaused] = HidiNextChapterReact.useState(false);
  const [motionAllowed, setMotionAllowed] = HidiNextChapterReact.useState(false);
  const [readySource, setReadySource] = HidiNextChapterReact.useState("");
  const [failedSource, setFailedSource] = HidiNextChapterReact.useState("");
  const sectionRef = HidiNextChapterReact.useRef(null);
  const chapters = [
    { id: "everyday", label: "Everyday", description: "Little plans. Beautiful everyday moments.", action: "Explore casual wear", href: "/collections/casual-wear" },
    { id: "work", label: "Work", description: "New ambitions. Your own way forward.", action: "Explore workwear", href: "/collections/work-wear" },
    { id: "celebrations", label: "Celebrations", description: "Your people. Your moments. Your celebrations.", action: "Explore occasion wear", href: "/collections/occasional-wear" }
  ];
  const current = chapters.find((item) => item.id === chapter) || chapters[0];
  const banner = HidiNextChapterImage(
    landingMedia,
    "hidi-edit-banner",
    "images/hidi-premium-ai-full-banner-lossless.png",
    "Four views of a HIDI ivory kurta with blue embroidery in a sunlit courtyard"
  );
  const slot = landingMedia["hidi-edit-banner"];
  const position = (value) => {
    const match = /^(\d{1,3})%\s+(\d{1,3})%$/.exec(value || "");
    return !match || value === "50% 50%" ? "72% 50%" : value;
  };
  const desktopPosition = position(slot?.desktopPosition);
  const mobilePosition = position(slot?.mobilePosition);
  const drift = (value) => {
    const [x, y] = value.split(" ");
    return `${Math.min(100, parseInt(x, 10) + 2)}% ${y}`;
  };
  const ready = Boolean(banner.src && readySource === banner.src && failedSource !== banner.src);
  const playing = ready && motionAllowed && !paused && slot?.fitMode !== "contain";
  HidiNextChapterReact.useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    let visible = !("IntersectionObserver" in window);
    const update = () => setMotionAllowed(visible && !document.hidden && !reduced.matches && !navigator.connection?.saveData);
    const observer = "IntersectionObserver" in window ? new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      update();
    }, { threshold: 0.05 }) : null;
    if (sectionRef.current) observer?.observe(sectionRef.current);
    reduced.addEventListener("change", update);
    document.addEventListener("visibilitychange", update);
    navigator.connection?.addEventListener?.("change", update);
    update();
    return () => {
      observer?.disconnect();
      reduced.removeEventListener("change", update);
      document.removeEventListener("visibilitychange", update);
      navigator.connection?.removeEventListener?.("change", update);
    };
  }, []);
  return /* @__PURE__ */ HidiNextChapterReact.createElement("section", { ref: sectionRef, className: "edit-section edit-section--campaign next-chapter", id: "hidi-edit", "aria-labelledby": "edit-title", "aria-busy": landingMedia.status === "loading", "data-landing-config-status": landingMedia.status }, /* @__PURE__ */ HidiNextChapterReact.createElement("div", { className: "edit-campaign next-chapter__frame" }, /* @__PURE__ */ HidiNextChapterReact.createElement("div", { className: "next-chapter__copy" }, /* @__PURE__ */ HidiNextChapterReact.createElement("p", { className: "next-chapter__eyebrow" }, "JUST KEEP GOING"), /* @__PURE__ */ HidiNextChapterReact.createElement("h2", { id: "edit-title" }, "For wherever", /* @__PURE__ */ HidiNextChapterReact.createElement("br", null), "you go ", /* @__PURE__ */ HidiNextChapterReact.createElement("em", null, "next.")), /* @__PURE__ */ HidiNextChapterReact.createElement("p", { className: "next-chapter__intro" }, "A new beginning. A familiar day.", /* @__PURE__ */ HidiNextChapterReact.createElement("br", null), "A moment that\u2019s yours."), /* @__PURE__ */ HidiNextChapterReact.createElement("p", { className: "next-chapter__prompt" }, "Where will today take you?"), /* @__PURE__ */ HidiNextChapterReact.createElement("div", { className: "next-chapter__choices", role: "group", "aria-label": "Choose your next chapter" }, chapters.map((item) => /* @__PURE__ */ HidiNextChapterReact.createElement("button", { key: item.id, type: "button", "aria-pressed": chapter === item.id, onClick: () => setChapter(item.id) }, item.label))), /* @__PURE__ */ HidiNextChapterReact.createElement("p", { className: "next-chapter__description", "aria-live": "polite", "aria-atomic": "true" }, current.description), /* @__PURE__ */ HidiNextChapterReact.createElement("a", { className: "next-chapter__link", href: current.href }, current.action, " ", /* @__PURE__ */ HidiNextChapterReact.createElement("span", { "aria-hidden": "true" }, "\u2197")), ready && slot?.fitMode !== "contain" && /* @__PURE__ */ HidiNextChapterReact.createElement("button", { className: "next-chapter__motion", type: "button", "aria-pressed": paused, onClick: () => setPaused((value) => !value) }, paused ? "Resume photo motion" : "Pause photo motion")), banner.src && failedSource !== banner.src ? /* @__PURE__ */ HidiNextChapterReact.createElement(
    "img",
    {
      ...banner,
      className: "next-chapter__photo",
      alt: banner.alt,
      width: "5460",
      height: "2048",
      loading: "lazy",
      decoding: "async",
      "data-photo-ready": ready || void 0,
      "data-photo-motion": playing ? "playing" : "paused",
      onLoad: (event) => {
        const image = event.currentTarget;
        const selectedUrl = banner.src;
        image.decode().then(() => {
          if (image.isConnected) setReadySource(selectedUrl);
        }).catch(() => {
          if (image.isConnected) setFailedSource(selectedUrl);
        });
      },
      onError: () => setFailedSource(banner.src),
      style: { ...banner.style, "--chapter-position-desktop": desktopPosition, "--chapter-position-mobile": mobilePosition, "--chapter-drift-desktop": drift(desktopPosition), "--chapter-drift-mobile": drift(mobilePosition) }
    }
  ) : /* @__PURE__ */ HidiNextChapterReact.createElement("div", { className: "next-chapter__placeholder", role: "img", "aria-label": landingMedia.status === "loading" ? "Loading HIDI photograph" : "HIDI photograph unavailable" })), /* @__PURE__ */ HidiNextChapterReact.createElement("div", { className: "next-chapter__signoff" }, /* @__PURE__ */ HidiNextChapterReact.createElement("p", null, "Every chapter begins with a little courage."), /* @__PURE__ */ HidiNextChapterReact.createElement("p", null, "Your path. Your pace. Your HIDI.")));
}
