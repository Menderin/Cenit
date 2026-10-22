import { useEffect, useRef, type ReactNode, type MouseEvent } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router';
import { HouseIcon } from '@phosphor-icons/react/dist/csr/House';
import { ShoppingCartSimpleIcon } from '@phosphor-icons/react/dist/csr/ShoppingCartSimple';
import { UsersIcon } from '@phosphor-icons/react/dist/csr/Users';
import { PackageIcon } from '@phosphor-icons/react/dist/csr/Package';
import { SidebarSimpleIcon } from '@phosphor-icons/react/dist/csr/SidebarSimple';
import { SignOutIcon } from '@phosphor-icons/react/dist/csr/SignOut';
import { CaretRightIcon } from '@phosphor-icons/react/dist/csr/CaretRight';
import { XIcon } from '@phosphor-icons/react/dist/csr/X';
import type { Account } from '@cenit/contracts/auth';
import { SessionWarning } from '../features/auth/components/SessionWarning.js';
import { usePurchaseReturnTo } from '../features/purchases/model/location.js';
import { usePurchaseGuard } from '../features/purchases/model/guard.js';
import { useSidebar } from '../shared/lib/use-sidebar.js';
import './administration.css';
const navigation = [
  { to: '/administracion', label: 'Inicio', end: true, icon: HouseIcon },
  { to: '/administracion/compras', label: 'Registro de compras', end: false, icon: ShoppingCartSimpleIcon },
  { to: '/administracion/personal', label: 'Sistema de personal', end: false, icon: UsersIcon },
  { to: '/administracion/bienes', label: 'Sistema de bienes', end: false, icon: PackageIcon },
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
  const { collapsed, setCollapsed, mobile, sidebar, panel, toggle, mounted, closing } = useSidebar(location.pathname);
  const current = navigation.find(link => link.end ? location.pathname === link.to : location.pathname.startsWith(link.to));
  const page = location.pathname === '/administracion/compras/nueva' ? 'Registrar compra'
    : location.pathname === '/administracion/compras/captura' ? 'Registrar desde captura'
    : location.pathname === '/administracion/compras/laboratorio' ? 'Revisar datos'
    : location.pathname.startsWith('/administracion/compras/') ? 'Detalle del registro' : current?.label ?? 'Inicio';
  useEffect(() => { document.title = `Cenit · ${page}`; return () => { document.title = 'Cenit'; }; }, [page]);
  useEffect(() => {
    if (focusedPath.current === location.pathname || (mobile && !collapsed)) return;
    focusedPath.current = location.pathname;
    main.current?.scrollTo(0, 0); window.scrollTo(0, 0); main.current?.focus({ preventScroll: true });
  }, [location.pathname, mobile, collapsed]);
  return <div className="admin-workspace">
    <a className="admin-skip" href="#admin-content">Ir al contenido</a>
    <div className={`admin-shell${collapsed ? ' admin-shell--collapsed' : ''}`}>
      {mobile && mounted && <div className={`workspace-nav-overlay${closing ? ' workspace-nav-overlay--closing' : ''}`} aria-hidden="true" onClick={() => setCollapsed(true)} />}
      <aside ref={sidebar} className="admin-sidebar" id="admin-navigation" inert={collapsed} aria-hidden={collapsed} role={mobile ? 'dialog' : undefined} aria-modal={mobile && !collapsed ? true : undefined} aria-label="Navegación administrativa">
        <div className="workspace-sidebar-content">
        <button type="button" className="workspace-nav-close admin-icon-button" aria-label="Cerrar navegación" onClick={() => setCollapsed(true)}><XIcon size={20} aria-hidden="true" /></button>
        <NavLink to="/administracion" onClick={follow} className="admin-brand" aria-label="Cenit, inicio administrativo">Cenit<span>Espacio administrativo</span></NavLink>
        <nav className="admin-nav" aria-label="Sistemas administrativos">
          <p className="admin-eyebrow">Administración</p>
          {navigation.map(({ icon: Icon, ...link }) => <NavLink key={link.to} to={link.to} end={link.end} onClick={follow} className={({ isActive }) => `admin-nav-item${isActive ? ' admin-nav-item--active' : ''}`}>
            {({ isActive }) => <><Icon size={18} weight={isActive ? 'fill' : 'regular'} aria-hidden="true" /><span>{link.label}</span></>}
          </NavLink>)}
        </nav>
        <div className="admin-sidebar__bottom">
          <button className="admin-logout" onClick={event => { event.currentTarget.focus({ preventScroll: true }); void logout(event.currentTarget); }}><SignOutIcon size={18} aria-hidden="true" />Cerrar sesión</button>
          <div className="admin-account"><span className="admin-avatar" aria-hidden="true">{account.name.slice(0, 1)}</span><div><strong>{account.name}</strong><span>Administrativo</span></div></div>
        </div>
        </div>
      </aside>
      <div ref={panel} className="admin-main">
        <header className="admin-toolbar">
          <div className="admin-toolbar__context"><button ref={toggle} type="button" className="admin-icon-button" aria-label={collapsed ? 'Mostrar navegación' : 'Ocultar navegación'} aria-expanded={!collapsed} aria-controls="admin-navigation" onClick={() => setCollapsed(!collapsed)}><SidebarSimpleIcon size={20} aria-hidden="true" /></button><nav className="admin-breadcrumb" aria-label="Ubicación"><NavLink to="/administracion" onClick={follow}>Administración</NavLink><CaretRightIcon size={12} aria-hidden="true" />{page !== current?.label && <><NavLink to={returnTo} onClick={follow}>Compras</NavLink><CaretRightIcon size={12} aria-hidden="true" /></>}<span aria-current="page" data-confirm-fallback tabIndex={-1}>{page}</span></nav></div>
          <div className="admin-toolbar__tools">{collapsed && <button className="admin-icon-button" aria-label="Cerrar sesión" onClick={event => { event.currentTarget.focus({ preventScroll: true }); void logout(event.currentTarget); }}><SignOutIcon size={18} aria-hidden="true" /></button>}</div>
        </header>
        <main className={`admin-content${location.pathname === '/administracion/compras/captura' ? ' admin-content--capture' : ''}`} id="admin-content" ref={main} tabIndex={-1} onFocusCapture={event => revealFocus(event.target)}>
          <SessionWarning expiresAt={expiresAt} logout={logout} />
          <div key={location.pathname} className="cenit-page-enter">{children}</div>
        </main>
      </div>
    </div>
  </div>;
}
