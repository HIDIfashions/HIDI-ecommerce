// Native header and hero are already interactive. Give their poster the first
// network flight; the unchanged application follows its decode/paint signal.
(() => {
  let started = false;
  const start = () => {
    if (started) return;
    started = true;
    clearTimeout(deadline);
    for (const template of document.querySelectorAll('template[data-hidi-home-app]')) {
      const original = template.content.firstElementChild;
      const element = document.createElement(original.tagName);
      for (const attribute of original.attributes) element.setAttribute(attribute.name, attribute.value);
      element.textContent = original.textContent;
      template.replaceWith(element);
    }
  };
  window.__HidiLoadHomeApp = start;
  const deadline = setTimeout(start, 1200);
  const fallback = () => {
    if (document.readyState !== 'loading' && !document.querySelector('video[data-hidi-first-hero]')) start();
  };
  document.addEventListener('readystatechange', fallback);
  fallback();
})();
