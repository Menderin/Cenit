import { useEffect, useRef, type ReactNode, type MouseEvent } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router';
import { HouseIcon } from '@phosphor-icons/react/dist/csr/House';
import { ShoppingCartSimpleIcon } from '@phosphor-icons/react/dist/csr/ShoppingCartSimple';
import { UsersIcon } from '@phosphor-icons/react/dist/csr/Users';
import { PackageIcon } from '@phosphor-icons/react/dist/csr/Package';
import { CaretRightIcon } from '@phosphor-icons/react/dist/csr/CaretRight';
import type { Account } from '@cenit/contracts/auth';
import { SessionWarning } from '../features/auth/components/SessionWarning.js';
import { usePurchaseReturnTo } from '../features/purchases/model/location.js';
import { usePurchaseGuard } from '../features/purchases/model/guard.js';
import { useSidebar } from '../shared/lib/use-sidebar.js';
import { WorkspaceShell } from '../shared/components/WorkspaceShell.js';
import './administration.css';
const navigation = [
  { to: '/administracion', label: 'Inicio', end: true, icon: HouseIcon },
  { to: '/administracion/compras', label: 'Registro de compras', end: false, icon: ShoppingCartSimpleIcon },
  { to: '/administracion/personal', label: 'Personal', end: false, icon: UsersIcon },
];
// Modules named in the Charter but not yet defined: reachable, visibly secondary.
const upcoming = [
  { to: '/administracion/bienes', label: 'Bienes', end: false, icon: PackageIcon },
];
export function AdministrativeLayout({ account, expiresAt, logout, children }: {
  account: Account; expiresAt: string; logout: (origin?: HTMLElement) => Promise<void>; children: ReactNode;
}) {
  const location = useLocation(), main = useRef<HTMLElement>(null);
  const focusedPath = useRef('');
  const returnTo = usePurchaseReturnTo();
  const guard = usePurchaseGuard(), navigate = useNavigate();
  function revealFocus(target: HTMLElement) {
    if (!target.matches('input, textarea, select, button, summary, a') || target.closest('.purchase-form-footer')) return;
    requestAnimationFrame(() => {
      if (!target.isConnected || document.activeElement !== target || !main.current?.contains(target)) return;
      const content = main.current.getBoundingClientRect(), field = target.getBoundingClientRect();
      const top = Math.max(content.top, main.current.previousElementSibling?.getBoundingClientRect().bottom ?? 0, 0);
      const footer = main.current.querySelector('.purchase-form-footer')?.getBoundingClientRect();
      const bottom = Math.min(content.bottom, window.innerHeight, footer && footer.bottom > top ? footer.top : Infinity);
      const review = target.closest<HTMLElement>('.capture-review');
      if (review && review.scrollHeight > review.clientHeight) {
        const frame = review.getBoundingClientRect();
        const visibleTop = Math.max(top, frame.top) + 16, visibleBottom = Math.min(bottom, frame.bottom) - 16;
        review.scrollBy({ top: field.top < visibleTop ? field.top - visibleTop : Math.max(0, field.bottom - visibleBottom), behavior: 'instant' });
        return;
      }
      if (field.top < top + 16 || field.bottom > bottom - 16) target.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    });
  }
  function follow(event: MouseEvent<HTMLAnchorElement>) {
    if (event.button || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    const target = event.currentTarget;
    target.focus({ preventScroll: true });
    guard.request(() => { if (mobile) setCollapsed(true); navigate(target.pathname + target.search); }, target);
  }
  const sidebarState = useSidebar(location.pathname), { collapsed, setCollapsed, mobile } = sidebarState;
  function navItem({ icon: Icon, ...link }: typeof navigation[number], soon = false) {
    return <NavLink key={link.to} to={link.to} end={link.end} onClick={follow} className={({ isActive }) => `workspace-nav-item${isActive ? ' workspace-nav-item--active' : ''}${soon ? ' workspace-nav-item--soon' : ''}`}>
      {({ isActive }) => <><Icon size={18} weight={isActive ? 'fill' : 'regular'} aria-hidden="true" /><span>{link.label}</span></>}
    </NavLink>;
  }
  const current = [...navigation, ...upcoming].find(link => link.end ? location.pathname === link.to : location.pathname.startsWith(link.to));
  const page = location.pathname === '/administracion/compras/nueva' ? 'Registrar compra'
    : location.pathname === '/administracion/compras/captura' ? 'Registrar desde captura'
    : location.pathname === '/administracion/compras/laboratorio' ? 'Revisar datos'
    : /\/administracion\/compras\/[^/]+\/editar$/.test(location.pathname) ? 'Editar compra'
    : location.pathname.startsWith('/administracion/compras/') ? 'Detalle del registro' : current?.label ?? 'Inicio';
  useEffect(() => { document.title = `Cenit · ${page}`; return () => { document.title = 'Cenit'; }; }, [page]);
  useEffect(() => {
    if (focusedPath.current === location.pathname || (mobile && !collapsed)) return;
    focusedPath.current = location.pathname;
    main.current?.scrollTo(0, 0); window.scrollTo(0, 0); main.current?.focus({ preventScroll: true });
  }, [location.pathname, mobile, collapsed]);
  return <WorkspaceShell sidebarState={sidebarState} className="admin-workspace" skip={{ href: '#admin-content', label: 'Ir al contenido' }}
    navigationId="admin-navigation" navigationLabel="Navegación administrativa" account={{ name: account.name, role: 'Administrativo' }} logout={logout}
    brand={<NavLink to="/administracion" onClick={follow} className="workspace-brand" aria-label="Cenit, inicio administrativo">Cenit<span>Espacio administrativo</span></NavLink>}
    navigation={<nav className="workspace-nav" aria-label="Sistemas administrativos">
      <p className="workspace-eyebrow">Administración</p>
      {navigation.map(link => navItem(link))}
      <p className="workspace-eyebrow workspace-eyebrow--section">Próximamente</p>
      {upcoming.map(link => navItem(link, true))}
    </nav>}
    toolbarStart={<nav className="admin-breadcrumb" aria-label="Ubicación"><NavLink to="/administracion" onClick={follow}>Administración</NavLink><CaretRightIcon size={12} aria-hidden="true" />{page !== current?.label && <><NavLink to={returnTo} onClick={follow}>Compras</NavLink><CaretRightIcon size={12} aria-hidden="true" /></>}<span aria-current="page" data-confirm-fallback tabIndex={-1}>{page}</span></nav>}>
    <main className={`admin-content${location.pathname === '/administracion/compras/captura' ? ' admin-content--capture' : ''}`} id="admin-content" ref={main} tabIndex={-1} onFocusCapture={event => revealFocus(event.target)}>
      <SessionWarning expiresAt={expiresAt} logout={logout} />
      <div key={location.pathname} className="cenit-page-enter">{children}</div>
    </main>
  </WorkspaceShell>;
}
