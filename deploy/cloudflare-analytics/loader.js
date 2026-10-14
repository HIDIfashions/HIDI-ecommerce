// Cloudflare Web Analytics for the verified HIDI India property.
(function () {
  "use strict";
  try {
    if (!["hidiindia.com", "www.hidiindia.com"].includes(window.location.hostname)) return;
    if (/^\/admin(?:\/|$)/.test(window.location.pathname)) return;
    if (document.querySelector('script[src="https://static.cloudflareinsights.com/beacon.min.js"]')) return;
    const script = document.createElement("script");
    script.type = "module";
    script.src = "https://static.cloudflareinsights.com/beacon.min.js";
    script.setAttribute("data-cf-beacon", '{"token":"5ab1ee3a7e1b457d90ad7bd08206b7ed"}');
    document.head.appendChild(script);
  } catch (_) {
    // Optional visitor analytics must never interrupt the shopping application.
  }
})();
