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

  // Observe a successful cart addition without changing its promise, body or response.
  // Click labels are unreliable: React disables/renames the button before bubbling.
  function trackCartRequests() {
    const originalFetch = window.fetch;
    if (typeof originalFetch !== "function") return;
    window.fetch = function (input, options) {
      let body = null;
      try {
        const request = input instanceof Request ? input : null;
        const url = new URL(request ? request.url : String(input), window.location.href);
        const method = String(options?.method || request?.method || "GET").toUpperCase();
        if (url.origin === window.location.origin && method === "POST"
            && /^\/(?:api\/store|v1)\/carts\/[^/]+\/items\/?$/.test(url.pathname)) {
          body = (options?.body !== undefined ? Promise.resolve(options.body)
            : request ? request.clone().text() : Promise.resolve("")).catch(function () { return null; });
        }
      } catch { /* Ignore metadata errors without preventing the original request. */ }
      const result = originalFetch.apply(this, arguments);
      try {
        if (!body) return result;
        result.then(function (response) {
          if (!response.ok) return;
          return Promise.all([body, response.clone().json()]).then(function (values) {
            const added = JSON.parse(values[0]);
            const cart = values[1];
            const quantity = added.quantity;
            if (typeof added.variantId !== "string" || !added.variantId.trim()
                || !Number.isInteger(quantity) || quantity < 1
                || !Number.isInteger(cart?.itemCount) || cart.itemCount < quantity) return;
            const entry = Array.isArray(cart.items)
              ? cart.items.find(function (item) { return item?.variant?.id === added.variantId; }) : null;
            const item = {
              item_id: entry?.product?.slug || added.variantId,
              quantity: quantity
            };
            if (entry?.product?.name) item.item_name = entry.product.name;
            if (entry?.variant?.size) item.item_variant = entry.variant.size;
            const paise = entry?.unitPricePaise ?? entry?.variant?.pricePaise;
            const params = { item_id: item.item_id, items: [item] };
            if (item.item_name) params.item_name = item.item_name;
            if (typeof paise === "number" && Number.isFinite(paise) && paise >= 0) {
              item.price = paise / 100;
              params.value = item.price * quantity;
            }
            emit("add_to_cart", params);
          });
        }).catch(function () { /* Tracking must never affect a shopping request. */ });
      } catch { /* Preserve the exact original fetch result on tracking errors. */ }
      return result;
    };
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

  const purchasesSent = new Set();
  const purchasesPending = new Set();
  const purchaseTimers = new Set();
  const purchaseRetries = new Map();

  function purchaseParams(receipt, order) {
    if (!receipt || receipt.orderNumber !== order || receipt.currency !== "INR"
        || !["CONFIRMED", "PACKED", "SHIPPED", "DELIVERED"].includes(receipt.status)) return null;
    const payment = receipt.payment;
    if (!payment || !(payment.status === "CAPTURED"
        || (payment.provider === "COD" && payment.status === "CREATED"))) return null;
    const money = function (value) { return Number.isSafeInteger(value) && value >= 0; };
    const fields = ["subtotalPaise", "discountPaise", "shippingPaise", "taxPaise", "totalPaise"];
    if (!fields.every(function (field) { return money(receipt[field]); })
        || receipt.subtotalPaise <= 0 || receipt.discountPaise > receipt.subtotalPaise
        || receipt.totalPaise !== receipt.subtotalPaise - receipt.discountPaise + receipt.shippingPaise + receipt.taxPaise
        || !Number.isSafeInteger(receipt.subtotalPaise + receipt.shippingPaise + receipt.taxPaise)
        || !Array.isArray(receipt.items) || !receipt.items.length || receipt.items.length > 200) return null;
    let subtotal = 0;
    for (const item of receipt.items) {
      if (!item || typeof item.slug !== "string" || !item.slug.trim()
          || typeof item.productName !== "string" || !item.productName.trim()
          || !Number.isSafeInteger(item.quantity) || item.quantity < 1
          || !money(item.unitPricePaise) || !money(item.totalPaise)
          || item.totalPaise !== item.unitPricePaise * item.quantity) return null;
      subtotal += item.totalPaise;
    }
    if (!Number.isSafeInteger(subtotal) || subtotal !== receipt.subtotalPaise) return null;
    // Allocate any order discount across lines. Rewards are payment, not a discount.
    let remainingDiscount = receipt.discountPaise;
    let remainingSubtotal = subtotal;
    const items = receipt.items.map(function (item) {
      const discount = remainingSubtotal === item.totalPaise ? remainingDiscount
        : Math.floor(remainingDiscount * (item.totalPaise / remainingSubtotal));
      remainingDiscount -= discount;
      remainingSubtotal -= item.totalPaise;
      const value = {
        item_id: item.slug,
        item_name: item.productName,
        quantity: item.quantity,
        price: (item.totalPaise - discount) / item.quantity / 100
      };
      if (typeof item.size === "string" && item.size) value.item_variant = item.size;
      if (discount) value.discount = discount / item.quantity / 100;
      return value;
    });
    return {
      transaction_id: order,
      value: (subtotal - receipt.discountPaise) / 100,
      shipping: receipt.shippingPaise / 100,
      tax: receipt.taxPaise / 100,
      items: items
    };
  }

  function purchaseWasSent(order) {
    if (purchasesSent.has(order)) return true;
    for (const name of ["localStorage", "sessionStorage"]) {
      try { if (window[name].getItem(PURCHASE_PREFIX + order)) return true; } catch {}
    }
    return false;
  }

  function trackPurchaseWhenReady() {
    const ctx = routeContext();
    if (ctx.path !== "/order-confirmed") return;
    const order = ctx.query.get("order");
    if (!order || purchaseWasSent(order) || purchasesPending.has(order) || purchaseTimers.has(order)) return;
    let session;
    try { session = window.localStorage.getItem("hidi_cart_session"); } catch { return; }
    if (typeof session !== "string" || session.length < 8) return;
    purchasesPending.add(order);
    // Read the same session-protected receipt used by the confirmation page.
    // A separate read covers cases where the page loaded before analytics initialized.
    Promise.resolve().then(function () {
      return window.fetch("/api/store/checkout/confirmation/" + encodeURIComponent(order)
        + "?sessionId=" + encodeURIComponent(session), { method: "GET", cache: "no-store" });
    }).then(function (response) {
      if (!response.ok) return null;
      return response.json();
    }).then(function (receipt) {
      const current = routeContext();
      if (current.path !== "/order-confirmed" || current.query.get("order") !== order || purchaseWasSent(order)) return;
      const params = purchaseParams(receipt, order);
      if (!params) {
        // Razorpay authorization can precede the capture webhook. Recheck only
        // that pending state, at most six times, while this receipt stays open.
        const attempts = purchaseRetries.get(order) || 0;
        if (receipt?.orderNumber === order && receipt.currency === "INR"
            && receipt.status === "PENDING_PAYMENT" && receipt.payment?.provider === "RAZORPAY"
            && ["AUTHORIZED", "CREATED"].includes(receipt.payment.status) && attempts < 6) {
          purchaseRetries.set(order, attempts + 1);
          purchaseTimers.add(order);
          window.setTimeout(function () {
            purchaseTimers.delete(order);
            const route = routeContext();
            if (route.path === "/order-confirmed" && route.query.get("order") === order) trackPurchaseWhenReady();
          }, 5000);
        }
        return;
      }
      emit("purchase", params);
      purchasesSent.add(order);
      for (const name of ["localStorage", "sessionStorage"]) {
        try { window[name].setItem(PURCHASE_PREFIX + order, "1"); } catch {}
      }
    }).catch(function () {
      // Receipt or storage failures must never block the confirmation page.
    }).finally(function () { purchasesPending.delete(order); });
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
      trackCartRequests();
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
