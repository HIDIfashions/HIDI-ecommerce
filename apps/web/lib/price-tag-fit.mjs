export function fitPriceTagDocument(doc) {
  for (const tag of doc.querySelectorAll('.price-tag')) {
    const content = tag.querySelector('.tag-content');
    if (!content) continue;
    content.style.transform = 'none';
    const style = doc.defaultView.getComputedStyle(tag);
    const available = tag.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom) - 1;
    const required = content.getBoundingClientRect().height;
    const scale = Math.min(1, available / Math.max(1, required));
    content.style.transformOrigin = 'top center';
    content.style.transform = `scale(${scale})`;
    tag.dataset.contentScale = String(scale);
  }
}
