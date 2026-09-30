import { useEffect, useState } from 'react';

export function useInView(ref, threshold = 0.02) {
  const [visible, setVisible] = useState(!('IntersectionObserver' in window));
  useEffect(() => {
    const element = ref.current;
    if (!element || !('IntersectionObserver' in window)) return;
    const observer = new IntersectionObserver(([entry]) => {
      setVisible(entry.isIntersecting);
    }, { threshold });
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref, threshold]);
  return visible;
}

export function useDocumentVisible() {
  const [visible, setVisible] = useState(!document.hidden);
  useEffect(() => {
    const update = () => setVisible(!document.hidden);
    document.addEventListener('visibilitychange', update);
    return () => document.removeEventListener('visibilitychange', update);
  }, []);
  return visible;
}
