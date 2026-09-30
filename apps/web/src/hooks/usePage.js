import { useCallback, useEffect, useState } from 'react';

const readPage = () => {
  const hash = window.location.hash.slice(1);
  const [route, search = ''] = hash.split('?');
  return {
    name: route === '/categories' ? 'categories' : 'landing',
    edit: new URLSearchParams(search).get('edit') || '',
  };
};

/** Hash routing works on static hosts without server-side rewrite rules.
 * Section anchors stay native. The category preview is not an auth boundary.
 */
export function usePage() {
  const [page, setPage] = useState(readPage);
  useEffect(() => {
    const update = () => setPage(readPage());
    window.addEventListener('popstate', update);
    window.addEventListener('hashchange', update);
    return () => {
      window.removeEventListener('popstate', update);
      window.removeEventListener('hashchange', update);
    };
  }, []);
  const navigate = useCallback((name, edit = '') => {
    const url = new URL(window.location.href);
    if (name === 'categories') {
      const search = new URLSearchParams();
      if (edit) search.set('edit', edit);
      url.hash = `/categories${search.size ? `?${search}` : ''}`;
    } else url.hash = '';
    window.history.pushState(null, '', url);
    setPage(readPage());
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
  }, []);
  return [page, navigate];
}
