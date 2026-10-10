// Theme state follows the control's own ARIA, checked, or class state in CSS.
// This only marks the document; it never changes shopping state or React nodes.
(() => {
  const root = document.documentElement;
  if (root.dataset.hidiButtonTheme !== 'site') root.dataset.hidiButtonTheme = 'site';
  const paint = () => {
    // Standalone Admin tools have their own paper shade. Match the actual
    // document surface instead of forcing the storefront shade onto them.
    const bodyColor = document.body && getComputedStyle(document.body).backgroundColor;
    const rootColor = getComputedStyle(root).backgroundColor;
    const transparent = value => !value || value === 'transparent' || value === 'rgba(0, 0, 0, 0)';
    const color = transparent(bodyColor) ? rootColor : bodyColor;
    if (!transparent(color)) root.style.setProperty('--hidi-button-body', color);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', paint, { once: true });
  else paint();
  window.addEventListener('pageshow', paint);
})();
