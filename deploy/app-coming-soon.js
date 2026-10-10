(() => {
  function update() {
    const content = document.querySelector('#hidi-dialog[open] #dialog-content');
    if (!content?.querySelector('.app-options')) return;
    const eyebrow = document.createElement('p'); eyebrow.className = 'eyebrow'; eyebrow.textContent = 'THE HIDI APP';
    const title = document.createElement('h2'); title.id = 'dialog-title'; title.textContent = 'HIDI app launching soon';
    const message = document.createElement('p'); message.textContent = 'We’re getting ready for Android and iPhone. Until then, enjoy shopping HIDI on our website.';
    const link = document.createElement('a'); link.className = 'dialog-secondary'; link.href = '/collections/all'; link.textContent = 'Continue shopping on the web';
    content.replaceChildren(eyebrow, title, message, link);
  }
  const observer = new MutationObserver(update);
  observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['open'] });
  update();
})();
