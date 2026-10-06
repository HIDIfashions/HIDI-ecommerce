(function () {
  "use strict";

  const PURCHASE_PREFIX = "hidi_purchase_";
  let config = null;
  let initialized = false;

  function safeNumber(value) {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value !== "string") return undefined;
    const parsed = Number(value.replace(/[^0-9.]/g, ""));
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  function routeContext() {
    const path = window.location.pathname;
    const query = new URLSearchParams(window.location.search);
    return { path, query };
  }

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const existing = document.querySelector('script[src="' + src + '"]');
      if (existing) {
        resolve();
        return;
      }
      const script = document.createElement("script");
      script.async = true;
      script.src = src;
      script.onload = resolve;
      script.onerror = reject;
      document.head.appendChild(script);
    });
  }

  async function initProviders(next) {
    config = next;
    if (!config || !config.enabled) return;

    if (config.ga4MeasurementId) {
      window.dataLayer = window.dataLayer || [];
      window.gtag = window.gtag || function () { window.dataLayer.push(arguments); };
      window.gtag("js", new Date());
      window.gtag("config", config.ga4MeasurementId, {
        send_page_view: false,
        anonymize_ip: true
      });
      await loadScript("https://www.googletagmanager.com/gtag/js?id=" + encodeURIComponent(config.ga4MeasurementId)).catch(function () {});
    }

    if (config.metaPixelId) {
      if (!window.fbq) {
        const fbq = function () {
          fbq.callMethod ? fbq.callMethod.apply(fbq, arguments) : fbq.queue.push(arguments);
        };
        fbq.push = fbq;
        fbq.loaded = true;
        fbq.version = "2.0";
        fbq.queue = [];
        window.fbq = fbq;
      }
      window.fbq("init", config.metaPixelId);
      await loadScript("https://connect.facebook.net/en_US/fbevents.js").catch(function () {});
    }
  }

  function metaEvent(name) {
    return {
      view_item: "ViewContent",
      add_to_cart: "AddToCart",
      begin_checkout: "InitiateCheckout",
      purchase: "Purchase",
      search: "Search",
      add_to_wishlist: "AddToWishlist"
    }[name] || null;
  }

  function emit(name, params) {
    if (!config || !config.enabled) return;
    const payload = Object.assign({ currency: "INR" }, params || {});

    if (config.ga4MeasurementId && window.gtag) {
      window.gtag("event", name, payload);
    }

    const mapped = metaEvent(name);
    if (mapped && config.metaPixelId && window.fbq) {
      const eventId = payload.transaction_id || undefined;
      const metaPayload = {};
      if (payload.value !== undefined) metaPayload.value = payload.value;
      if (payload.currency) metaPayload.currency = payload.currency;
      if (payload.item_id) metaPayload.content_ids = [payload.item_id];
      if (payload.item_name) metaPayload.content_name = payload.item_name;
      if (payload.search_term) metaPayload.search_string = payload.search_term;
      if (eventId) window.fbq("track", mapped, metaPayload, { eventID: String(eventId) });
      else window.fbq("track", mapped, metaPayload);
    }

    window.dispatchEvent(new CustomEvent("hidi-analytics-event", {
      detail: { name, params: payload }
    }));
  }

  function pageView() {
    if (!config || !config.enabled) return;
    const locationValue = window.location.href;
    const titleValue = document.title;
    if (config.ga4MeasurementId && window.gtag) {
      window.gtag("event", "page_view", {
        page_location: locationValue,
        page_path: window.location.pathname + window.location.search,
        page_title: titleValue
      });
    }
    if (config.metaPixelId && window.fbq) window.fbq("track", "PageView");

    const ctx = routeContext();
    if (/^\/products\//.test(ctx.path)) {
      const slug = decodeURIComponent(ctx.path.split("/").filter(Boolean)[1] || "");
      emit("view_item", { item_id: slug, item_name: document.querySelector(".pdp-info h1")?.textContent?.trim() || slug });
    } else if (ctx.path === "/cart") {
      emit("view_cart");
    } else if (ctx.path === "/checkout") {
      emit("begin_checkout");
    } else if (ctx.path === "/search") {
      const term = ctx.query.get("q") || ctx.query.get("query") || "";
      if (term) emit("search", { search_term: term });
    } else if (ctx.path.startsWith("/collections/")) {
      emit("view_item_list", { item_list_name: decodeURIComponent(ctx.path.split("/").filter(Boolean)[1] || "collection") });
    }

    trackPurchaseWhenReady();
  }

  function textOf(element) {
    return (element && element.textContent ? element.textContent : "").replace(/\s+/g, " ").trim();
  }

  function closestProductContext(target) {
    const card = target.closest("article, [class*='card'], [class*='product']");
    const link = card && card.querySelector('a[href^="/products/"]');
    const href = link && link.getAttribute("href");
    const itemId = href ? decodeURIComponent(href.split("/").filter(Boolean)[1] || "") : undefined;
    const name = card && card.querySelector("h2, h3, [class*='name']");
    return { item_id: itemId, item_name: textOf(name) || undefined };
  }

  function trackClicks() {
    document.addEventListener("click", function (event) {
      const target = event.target instanceof Element ? event.target.closest("a,button") : null;
      if (!target) return;
      const label = textOf(target).toLowerCase();
      const href = target.getAttribute("href") || "";

      if (href.startsWith("/products/")) {
        const ctx = closestProductContext(target);
        emit("select_item", ctx);
      }

      if (!target.matches(":disabled") && /(add to cart|add to bag|quick add)/i.test(label)) {
        emit("add_to_cart", closestProductContext(target));
      }

      if (!target.matches(":disabled") && /(save|wishlist)/i.test(label)) {
        emit("add_to_wishlist", closestProductContext(target));
      }
    }, { passive: true });

    document.addEventListener("submit", function (event) {
      const form = event.target instanceof HTMLFormElement ? event.target : null;
      if (!form) return;
      const field = form.querySelector('input[type="search"], input[name="q"], input[placeholder*="Search" i]');
      if (field && field.value.trim()) emit("search", { search_term: field.value.trim() });
    }, { passive: true });
  }

  function trackPurchaseWhenReady() {
    const ctx = routeContext();
    if (ctx.path !== "/order-confirmed") return;
    const order = ctx.query.get("order");
    if (!order) return;
    const storageKey = PURCHASE_PREFIX + order;
    try {
      if (window.sessionStorage.getItem(storageKey)) return;
    } catch {}

    let attempts = 0;
    const find = function () {
      attempts += 1;
      const totalNode = document.querySelector(".confirmation-total-row strong")
        || document.querySelector("[class*='confirmation-total'] strong")
        || Array.from(document.querySelectorAll("strong")).find(function (node) {
          return /₹\s*[0-9,]+/.test(textOf(node));
        });
      const value = safeNumber(textOf(totalNode));
      if (value !== undefined && value > 0) {
        emit("purchase", { transaction_id: order, value: value });
        try { window.sessionStorage.setItem(storageKey, "1"); } catch {}
        return;
      }
      if (attempts < 20) window.setTimeout(find, 500);
    };
    find();
  }

  function hookHistory() {
    const push = history.pushState;
    const replace = history.replaceState;
    history.pushState = function () {
      const result = push.apply(this, arguments);
      window.setTimeout(pageView, 0);
      return result;
    };
    history.replaceState = function () {
      const result = replace.apply(this, arguments);
      window.setTimeout(pageView, 0);
      return result;
    };
    window.addEventListener("popstate", pageView);
  }

  async function start() {
    if (initialized) return;
    initialized = true;
    try {
      const response = await fetch("/api/hidi/analytics-config", { cache: "no-store" });
      if (!response.ok) return;
      const next = await response.json();
      await initProviders(next);
      if (!next.enabled) return;
      trackClicks();
      hookHistory();
      pageView();
    } catch {
      // Analytics must never block shopping.
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }
})();
