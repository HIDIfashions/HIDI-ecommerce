'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowUpRight, Search, X } from 'lucide-react';
import { adminFetch } from './admin-client';
import styles from './admin-workspace.module.css';
type Result = { id: string; kind: string; title: string; detail: string; href: string };
export function AdminSearch({ open, onClose, pages }: { open: boolean; onClose: () => void; pages: { title: string; href: string }[] }) {
  const dialog = useRef<HTMLDialogElement>(null); const input = useRef<HTMLInputElement>(null); const router = useRouter();
  const [query, setQuery] = useState(''); const [results, setResults] = useState<Result[]>([]); const [loading, setLoading] = useState(false); const [error, setError] = useState(''); const [selected, setSelected] = useState(0);
  useEffect(() => { if (open) { dialog.current?.showModal(); input.current?.focus(); } else dialog.current?.close(); }, [open]);
  useEffect(() => {
    setResults([]); setError(''); setSelected(0);
    if (!open || query.trim().length < 2) { setLoading(false); return; }
    const controller = new AbortController(); let active = true; setLoading(true);
    const timer = window.setTimeout(() => { void adminFetch<{ results: Result[] }>(`/api/admin/dashboard/search?q=${encodeURIComponent(query.trim())}`, controller.signal).then(body => { if (active) setResults(body.results); }).catch(err => { if (active && !controller.signal.aborted) setError(err instanceof Error ? err.message : 'Search unavailable.'); }).finally(() => { if (active) setLoading(false); }); }, 250);
    return () => { active = false; window.clearTimeout(timer); controller.abort(); };
  }, [query, open]);
  const pageResults = pages.filter(p => p.title.toLowerCase().includes(query.trim().toLowerCase())).map(p => ({ id: p.href, kind: 'Page', title: p.title, detail: 'Open workspace', href: p.href }));
  const all = [...results, ...pageResults];
  useEffect(() => { if (open) document.getElementById(`admin-search-${selected}`)?.scrollIntoView({ block: 'nearest' }); }, [selected, open, all.length]);
  function navigate(href: string) { if (!href.startsWith('/admin')) return; onClose(); router.push(href); }
  return <dialog ref={dialog} className={styles.searchDialog} onCancel={onClose} onClose={() => { if (open) onClose(); }} aria-labelledby="admin-search-title">
    <div className={styles.searchHeading}><div><p className={styles.eyebrow}>HIDI COMMAND SEARCH</p><h2 id="admin-search-title">Everything, within reach.</h2></div><button aria-label="Close search" onClick={onClose}><X size={21}/></button></div>
    <div className={styles.searchInput}><Search size={22} aria-hidden="true"/><input ref={input} value={query} onChange={event => setQuery(event.target.value)} maxLength={100} placeholder="Order number, customer phone, email, AWB or SKU" aria-label="Search across HIDI admin" role="combobox" aria-autocomplete="list" aria-controls="admin-search-results" aria-expanded={all.length > 0} aria-activedescendant={all[selected] ? `admin-search-${selected}` : undefined} onKeyDown={event => { if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); setSelected(n => Math.max(0, Math.min(all.length - 1, n + (event.key === 'ArrowDown' ? 1 : -1)))); } if (event.key === 'Enter' && all[selected]) { event.preventDefault(); navigate(all[selected].href); } }}/></div>
    <p className={styles.searchMeta} role="status">{loading ? 'Searching authorised records…' : error || (query.trim().length < 2 ? 'Type at least two characters to search records, or jump to a page.' : `${all.length} results · Your role determines what you can see`)}</p>
    <div id="admin-search-results" role="listbox" aria-label="Search results" className={styles.searchResults}>{all.map((result, index) => <div key={`${result.kind}-${result.id}`} id={`admin-search-${index}`} role="option" aria-selected={index === selected} tabIndex={0} className={`${styles.searchResult} ${selected === index ? styles.searchSelected : ''}`} onFocus={() => setSelected(index)} onClick={() => navigate(result.href)} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); navigate(result.href); } }}><span className={styles.resultKind}>{result.kind}</span><div><strong>{result.title}</strong><small>{result.detail}</small></div><ArrowUpRight size={18} aria-hidden="true"/></div>)}</div>
    {!loading && query.length >= 2 && all.length === 0 && !error && <p className={styles.empty}>No matches. Try an order number, phone, product name or SKU.</p>}
    <footer className={styles.searchMeta}>↑ ↓ to navigate · Enter to open · Esc to close</footer>
  </dialog>;
}
