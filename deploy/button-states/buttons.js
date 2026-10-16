// Theme state follows the control's own ARIA, checked, or class state in CSS.
// Document metadata only; the application keeps ownership of control state.
(() => {
  const root = document.documentElement;
  const mark = () => {
    if (root.dataset.hidiButtonTheme !== 'site') root.dataset.hidiButtonTheme = 'site';
  };
  mark();
  const paint = () => {
    mark();
    // Standalone Admin tools have their own paper shade. Match the actual
    // document surface instead of forcing the storefront shade onto them.
    const bodyColor = document.body && getComputedStyle(document.body).backgroundColor;
    const rootColor = getComputedStyle(root).backgroundColor;
    const transparent = value => !value || value === 'transparent' || value === 'rgba(0, 0, 0, 0)';
    const color = transparent(bodyColor) ? rootColor : bodyColor;
    if (!transparent(color)) root.style.setProperty('--hidi-button-body', color);
  };
  // Retained React releases may remove unknown root attributes on hydration.
  // Observe this marker alone, rather than component nodes or shopping state.
  new MutationObserver(() => {
    if (root.dataset.hidiButtonTheme !== 'site') paint();
  }).observe(root, { attributes: true, attributeFilter: ['data-hidi-button-theme'] });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', paint, { once: true });
  else paint();
  window.addEventListener('pageshow', paint);
})();
