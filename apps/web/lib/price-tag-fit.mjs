export function fitPriceTagDocument(doc) {
  for (const tag of doc.querySelectorAll('.price-tag')) {
    const content = tag.querySelector('.tag-content');
    if (!content) continue;
    content.style.transform = 'none';
    const address = tag.querySelector('.postal-address');
    if (address) {
      const text = address.innerText.replace(/\s+/g, ' ').trim();
      const words = text.split(' ');
      const addressStyle = doc.defaultView.getComputedStyle(address);
      const baseSize = parseFloat(addressStyle.fontSize);
      const canvas = doc.createElement('canvas');
      const context = canvas.getContext('2d');
      context.font = `${addressStyle.fontWeight} ${baseSize}px ${addressStyle.fontFamily}`;
      let lines = [text, ''];
      let widest = Infinity;
      for (let split = 1; split < words.length; split++) {
        const pair = [words.slice(0, split).join(' '), words.slice(split).join(' ')];
        const width = Math.max(...pair.map(line => context.measureText(line).width));
        if (width < widest) { widest = width; lines = pair; }
      }
      if (words.length === 1) widest = context.measureText(text).width;
      address.replaceChildren(...lines.map(line => {
        const row = doc.createElement('span');
        row.textContent = line || '\u00a0';
        row.style.display = 'block';
        row.style.whiteSpace = 'nowrap';
        return row;
      }));
      address.style.fontSize = Math.min(baseSize, baseSize * (address.clientWidth - 1) / Math.max(1, widest)) + 'px';
      address.dataset.lines = '2';
    }

    const style = doc.defaultView.getComputedStyle(tag);
    const available = tag.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom) - 1;
    const required = content.getBoundingClientRect().height;
    const scale = Math.min(1, available / Math.max(1, required));
    content.style.transformOrigin = 'top center';
    content.style.transform = `scale(${scale})`;
    tag.dataset.contentScale = String(scale);
  }
}
