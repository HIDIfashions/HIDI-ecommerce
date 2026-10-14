export function HidiSeoLinkProps(href, action) {
  const ordinary = event => !event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey;
  return {
    href,
    onClick(event) {
      if (event.button !== 0 || !ordinary(event)) return;
      event.preventDefault();
      action();
    },
    onKeyDown(event) {
      if (event.key === ' ' && ordinary(event)) event.preventDefault();
    },
    onKeyUp(event) {
      if (event.key !== ' ' || !ordinary(event)) return;
      event.preventDefault();
      action();
    },
  };
}
