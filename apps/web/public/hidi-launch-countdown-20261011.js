(() => {
  'use strict';
  if (document.getElementById('hidi-launch-countdown')) return;
  const launchTime = Date.parse('2026-10-11T19:01:00+05:30');
  const banner = document.createElement('aside');
  banner.id = 'hidi-launch-countdown';
  banner.className = 'hidi-launch-countdown';
  banner.hidden = true;
  banner.setAttribute('aria-label', 'HIDI launch countdown');
  banner.dataset.launchAt = '2026-10-11T19:01:00+05:30';
  banner.innerHTML = '<span class="hidi-countdown-label">HIDI launches in</span>' +
    '<span class="hidi-countdown-clock" role="timer" aria-live="off"></span>' +
    '<a class="hidi-countdown-shop" href="/collections/all" hidden>Shop now <span aria-hidden="true">→</span></a>';
  document.body.appendChild(banner);
  const label = banner.querySelector('.hidi-countdown-label');
  const clock = banner.querySelector('.hidi-countdown-clock');
  const shop = banner.querySelector('.hidi-countdown-shop');
  let previousText = '';
  let observedHeader = null;
  const resizeObserver = typeof ResizeObserver === 'function' ? new ResizeObserver(position) : null;
  function position() {
    const header = document.querySelector('#root .hidi-page .site-header');
    if (header !== observedHeader) {
      resizeObserver?.disconnect();
      if (header) resizeObserver?.observe(header);
      observedHeader = header;
    }
    if (header) {
      const top = Math.max(0, header.getBoundingClientRect().bottom);
      banner.style.top = top + 'px';
    }
  }
  function update() {
    banner.hidden = !document.querySelector('#root .hidi-page');
    if (banner.hidden) return;
    position();
    const seconds = Math.max(0, Math.ceil((launchTime - Date.now()) / 1000));
    const live = seconds === 0;
    banner.dataset.phase = live ? 'live' : 'countdown';
    if (live) {
      label.textContent = 'We’re live';
      clock.hidden = true;
      shop.hidden = false;
      return;
    }
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor(seconds / 60) % 60;
    const remainder = seconds % 60;
    const text = [hours, minutes, remainder].map(value => String(value).padStart(2, '0')).join(' : ');
    if (text !== previousText) {
      clock.textContent = text;
      clock.setAttribute('aria-label', `${hours} hours ${minutes} minutes ${remainder} seconds until launch at 7:01 PM Indian Standard Time`);
      previousText = text;
    }
    label.textContent = 'HIDI launches in';
    clock.hidden = false;
    shop.hidden = true;
  }
  const root = document.getElementById('root');
  if (root) new MutationObserver(update).observe(root, { childList: true, subtree: true });
  window.addEventListener('resize', position, { passive: true });
  window.addEventListener('pageshow', update);
  document.addEventListener('visibilitychange', update);
  update();
  setInterval(() => { if (!document.hidden) update(); }, 1000);
})();
