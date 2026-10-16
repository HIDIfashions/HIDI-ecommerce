'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { LayoutDashboard, ShoppingBag, Truck, RotateCcw, BarChart3, Package, Tags, Warehouse, PackagePlus, Upload, Users, ShieldCheck, Search, Menu, X, LogOut, ArrowUpRight } from 'lucide-react';
import { adminFetch, refreshAdminSession, type Staff } from './admin-client';
import { AdminSearch } from './admin-search';
import styles from './admin-workspace.module.css';
const Session = createContext<Staff | null>(null);
export const useAdminStaff = () => useContext(Session);
const links = [
  { href: '/admin', name: 'Overview', icon: LayoutDashboard, group: 'Workspace', order: true },
  { href: '/admin/orders', name: 'Orders', icon: ShoppingBag, group: 'Workspace', order: true },
  { href: '/admin/deliveries', name: 'Deliveries', icon: Truck, group: 'Workspace', order: true },
  { href: '/admin/returns', name: 'Returns & exchanges', icon: RotateCcw, group: 'Workspace', order: true },
  { href: '/admin/reports', name: 'Sales & reports', icon: BarChart3, group: 'Workspace', order: true },
  { href: '/admin/products', name: 'Products', icon: Package, group: 'Manage', order: false },
  { href: '/admin/products/price-tags', name: 'Price tags', icon: Tags, group: 'Manage', order: false },
  { href: '/admin/inventory', name: 'Inventory', icon: Warehouse, group: 'Manage', order: false },
  { href: '/admin/inventory/receive', name: 'Receive stock', icon: PackagePlus, group: 'Manage', order: false, write: true },
  { href: '/admin/import', name: 'Bulk imports', icon: Upload, group: 'Manage', order: false, catalogWrite: true },
  { href: '/admin/customers', name: 'Customers', icon: Users, group: 'Manage', order: true },
  { href: '/admin/staff', name: 'Team & access', icon: ShieldCheck, group: 'Manage', order: false, owner: true },
  { href: '/admin/privacy-policy', name: 'Privacy policy', icon: ShieldCheck, group: 'Manage', order: false, owner: true },
];
export function adminNavigation(role: string) {
  return links.filter(item => (!item.owner || role === 'OWNER') && (!item.order || role !== 'CATALOG') && (!item.write || ['OWNER', 'OPERATIONS'].includes(role)) && (!item.catalogWrite || ['OWNER', 'CATALOG'].includes(role)));
}
export function AdminWorkspace({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  if (pathname === '/admin/sign-in' || pathname === '/admin/signin') return <>{children}</>;
  return <AuthenticatedWorkspace>{children}</AuthenticatedWorkspace>;
}
function AuthenticatedWorkspace({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [admin, setAdmin] = useState<Staff | null>(null);
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const [searchOpen, setSearchOpen] = useState(false);
  const [locking, setLocking] = useState(false);
  const menu = useRef<HTMLDialogElement>(null);
  const menuButton = useRef<HTMLButtonElement>(null);
  const searchButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    let active = true; const controller = new AbortController(); setChecking(true);
    void adminFetch<{ admin?: Staff }>('/api/admin/session', controller.signal).then(body => {
      if (!body.admin || !['OWNER', 'OPERATIONS', 'SUPPORT', 'CATALOG'].includes(body.admin.role)) throw new Error('This account does not have an active HIDI admin role.');
      if (active) { setAdmin(body.admin); setError(''); }
    }).catch(err => { if (active && !controller.signal.aborted) { setAdmin(null); setError(err instanceof Error ? err.message : 'Unable to verify access.'); } }).finally(() => { if (active) setChecking(false); });
    return () => { active = false; controller.abort(); };
  }, [revision]);
  useEffect(() => {
    const expired = () => { setAdmin(null); setError('Your session has expired. Sign in to continue.'); };
    window.addEventListener('hidi-admin-expired', expired);
    const timer = window.setInterval(() => { if (document.visibilityState === 'visible' && admin) void refreshAdminSession().then(ok => { if (!ok) expired(); }); }, 40 * 60000);
    return () => { window.removeEventListener('hidi-admin-expired', expired); window.clearInterval(timer); };
  }, [admin]);
  useEffect(() => { menu.current?.close(); }, [pathname]);
  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => { if (admin && (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); setSearchOpen(true); } };
    window.addEventListener('keydown', shortcut); return () => window.removeEventListener('keydown', shortcut);
  }, [admin]);
  async function lock() {
    setLocking(true);
    try { const response = await fetch('/api/admin/session', { method: 'DELETE' }); if (!response.ok) throw new Error('Sign out failed. Please retry.'); setAdmin(null); setError('You have securely signed out.'); }
    catch (err) { setError(err instanceof Error ? err.message : 'Sign out failed.'); }
    finally { setLocking(false); }
  }
  if (checking || !admin) return <main data-hidi-admin-workspace="v1" className={styles.gate}><section><div className={styles.gateBrand}><img src="/brand/hidi-logo-header.svg" width="154" height="81" alt="HIDI — Wear the Feeling" /></div><p className={styles.eyebrow}>HIDI ADMIN</p><h1>{checking ? 'Opening your workspace' : 'Secure staff access'}</h1><p role="status">{checking ? 'Verifying your existing staff session…' : error || 'Sign in with your approved staff account.'}</p>{!checking && <div className={styles.actions}><Link className={styles.primary} href="/admin/sign-in">Staff sign in</Link><button onClick={() => setRevision(n => n + 1)}>Retry</button></div>}<small>Administrators and permissions are managed by the owner. No account is created by this dashboard.</small></section></main>;
  const items = adminNavigation(admin.role);
  const current = [...links].sort((a, b) => b.href.length - a.href.length).find(item => pathname === item.href || (item.href !== '/admin' && pathname.startsWith(item.href + '/')));
  const allowed = !current || items.some(item => item.href === current.href);
  function navigation() { return <nav aria-label="Admin navigation">{['Workspace', 'Manage'].map(group => <div key={group} className={styles.navGroup}><p>{group}</p>{items.filter(item => item.group === group).map(item => { const Icon = item.icon; const active = current?.href === item.href; const NavigationLink = item.href === '/admin/privacy-policy' ? 'a' : Link; return <NavigationLink key={item.href} href={item.href} onClick={() => menu.current?.close()} className={`${styles.navLink} ${active ? styles.navActive : ''}`} aria-current={active ? 'page' : undefined}><Icon size={18} aria-hidden="true" /><span>{item.name}</span></NavigationLink>; })}</div>)}</nav>; }
  return <Session.Provider value={admin}><div data-hidi-admin-workspace="v1" className={styles.workspace}>
    <a href="#admin-content" className={styles.skip}>Skip to workspace</a>
    <aside className={styles.sidebar}><Link href={admin.role === 'CATALOG' ? '/admin/products' : '/admin'} className={styles.brand}><img src="/brand/hidi-logo-header.svg" width="146" height="77" alt="HIDI — Wear the Feeling" /></Link><span className={styles.workspaceLabel}>OPERATIONS WORKSPACE</span>{navigation()}<div className={styles.sidebarBottom}><span className={styles.smallDot} /> Existing HIDI environment<br/><small>Access controlled · private workspace</small></div></aside>
    <div className={styles.main}>
      <header className={styles.topbar}><button ref={menuButton} className={styles.mobileMenu} aria-label="Open navigation" onClick={() => menu.current?.showModal()}><Menu size={21}/></button><div className={styles.breadcrumb}><span>HIDI Admin</span><span aria-hidden="true">/</span><strong>{current?.name || 'Workspace'}</strong></div><button ref={searchButton} className={styles.searchTrigger} onClick={() => setSearchOpen(true)}><Search size={18}/><span>Search orders, products, customers…</span><kbd>⌘ / Ctrl K</kbd></button><a href="/" className={styles.storeLink}>Storefront <ArrowUpRight size={16}/></a><div className={styles.profile} title={`${admin.displayName} · ${admin.role}`}><span>{admin.displayName.slice(0, 2).toUpperCase()}</span><div><strong>{admin.displayName}</strong><small>{admin.role.toLowerCase()}</small></div></div><button disabled={locking} aria-label="Sign out of admin" title="Sign out" onClick={() => void lock()}><LogOut size={18}/></button></header>
      <div id="admin-content" tabIndex={-1} className={styles.content}>{error && admin && <p role="alert" className={styles.error}>{error}</p>}{allowed ? children : <section className={styles.empty}><ShieldCheck size={32}/><h1>Access is limited to your role</h1><p>Use the navigation to open your permitted workspace.</p><Link className={styles.primary} href="/admin/products">Open catalogue</Link></section>}</div>
      <footer className={styles.workspaceFooter}>HIDI Operations <span>Indian Standard Time · INR · Role-based access</span></footer>
    </div>
    <dialog ref={menu} className={styles.menuDialog} onClose={() => menuButton.current?.focus()} aria-label="Admin navigation"><button className={styles.close} aria-label="Close navigation" onClick={() => menu.current?.close()}><X size={22}/></button><img src="/brand/hidi-logo-header.svg" width="146" height="77" alt="HIDI" />{navigation()}</dialog>
    <AdminSearch open={searchOpen} onClose={() => { setSearchOpen(false); searchButton.current?.focus(); }} pages={items.map(item => ({ title: item.name, href: item.href }))}/>
  </div></Session.Provider>;
}
