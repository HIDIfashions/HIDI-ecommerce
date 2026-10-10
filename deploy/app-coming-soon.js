(() => {
  function update() {
    const content = document.querySelector('#hidi-dialog[open] #dialog-content');
    const options = content?.querySelector('.app-options');
    if (!options || options.dataset.hidiSoon === 'true') return;
    // Retain React-owned sibling nodes so closing/reopening the dialog can
    // reconcile its existing component tree without stale removed elements.
    options.dataset.hidiSoon = 'true'; options.style.display = 'none'; options.setAttribute('aria-hidden', 'true');
    const title = content.querySelector('#dialog-title');
    if (title) {
      const textNodes = [...title.childNodes].filter(node => node.nodeType === Node.TEXT_NODE);
      textNodes.forEach((node, index) => { node.nodeValue = index ? '' : 'HIDI app launching soon'; });
      title.querySelectorAll('br').forEach(node => { node.style.display = 'none'; });
    }
    const paragraphs = content.querySelectorAll(':scope > p');
    if (paragraphs[0]) paragraphs[0].textContent = 'THE HIDI APP';
    if (paragraphs[1]) paragraphs[1].textContent = 'We’re getting ready for Android and iPhone. Until then, enjoy shopping HIDI on our website.';
    const note = content.querySelector('.integration-note'); if (note) note.style.display = 'none';
    const link = content.querySelector('.dialog-secondary'); if (link) link.textContent = 'Continue shopping on the web';
  }
  const observer = new MutationObserver(update);
  observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['open'] });
  update();
})();
