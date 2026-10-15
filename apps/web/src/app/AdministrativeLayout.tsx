import { useEffect, useRef, useState, type ReactNode, type MouseEvent } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router';
import { HouseIcon } from '@phosphor-icons/react/dist/csr/House';
import { ShoppingCartSimpleIcon } from '@phosphor-icons/react/dist/csr/ShoppingCartSimple';
import { UsersIcon } from '@phosphor-icons/react/dist/csr/Users';
import { PackageIcon } from '@phosphor-icons/react/dist/csr/Package';
import { SidebarSimpleIcon } from '@phosphor-icons/react/dist/csr/SidebarSimple';
import { SignOutIcon } from '@phosphor-icons/react/dist/csr/SignOut';
import { CaretRightIcon } from '@phosphor-icons/react/dist/csr/CaretRight';
import type { Account } from '@cenit/contracts/auth';
import { SessionWarning } from '../features/auth/components/SessionWarning.js';
import { usePurchaseReturnTo } from '../features/purchases/model/location.js';
import { usePurchaseGuard } from '../features/purchases/model/guard.js';
import './administration.css';
const navigation = [
  { to: '/administracion', label: 'Inicio', end: true, icon: HouseIcon },
  { to: '/administracion/compras', label: 'Sistema de compra', end: false, icon: ShoppingCartSimpleIcon },
  { to: '/administracion/personal', label: 'Sistema de personal', end: false, icon: UsersIcon },
  { to: '/administracion/bienes', label: 'Sistema de bienes', end: false, icon: PackageIcon },
];
export function AdministrativeLayout({ account, expiresAt, logout, children }: {
  account: Account; expiresAt: string; logout: (origin?: HTMLElement) => Promise<void>; children: ReactNode;
}) {
  const location = useLocation(), main = useRef<HTMLElement>(null);
  const returnTo = usePurchaseReturnTo();
  const guard = usePurchaseGuard(), navigate = useNavigate();
  function revealFocus(target: HTMLElement) {
    if (!target.matches('input, textarea, select, button, summary, a')) return;
    requestAnimationFrame(() => {
      if (!target.isConnected || document.activeElement !== target || !main.current?.contains(target)) return;
      const content = main.current.getBoundingClientRect(), field = target.getBoundingClientRect();
      const top = Math.max(content.top, main.current.previousElementSibling?.getBoundingClientRect().bottom ?? 0, 0);
      if (field.top < top + 16 || field.bottom > Math.min(content.bottom, window.innerHeight) - 16) target.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    });
  }
  function follow(event: MouseEvent<HTMLAnchorElement>) {
    if (event.button || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    const target = event.currentTarget;
    target.focus({ preventScroll: true });
    guard.request(() => navigate(target.pathname + target.search), target);
  }
  const [collapsed, setCollapsed] = useState(() => window.matchMedia('(max-width: 760px)').matches);
  const current = navigation.find(link => link.end ? location.pathname === link.to : location.pathname.startsWith(link.to));
  const page = location.pathname === '/administracion/compras/nueva' ? 'Nueva solicitud'
    : location.pathname === '/administracion/compras/captura' ? 'Revisar captura'
    : location.pathname === '/administracion/compras/laboratorio' ? 'Revisar datos'
    : location.pathname.startsWith('/administracion/compras/') ? 'Detalle de solicitud' : current?.label ?? 'Inicio';
  useEffect(() => { document.title = `Cenit · ${page}`; return () => { document.title = 'Cenit'; }; }, [page]);
  useEffect(() => { main.current?.scrollTo(0, 0); window.scrollTo(0, 0); main.current?.focus({ preventScroll: true }); }, [location.pathname]);
  useEffect(() => { if (window.matchMedia('(max-width: 760px)').matches) setCollapsed(true); }, [location.pathname]);
  useEffect(() => {
    const media = window.matchMedia('(max-width: 760px)');
    const resize = () => setCollapsed(media.matches);
    media.addEventListener('change', resize);
    return () => media.removeEventListener('change', resize);
  }, []);
  return <div className="admin-workspace">
    <a className="admin-skip" href="#admin-content">Ir al contenido</a>
    <div className={`admin-shell${collapsed ? ' admin-shell--collapsed' : ''}`}>
      <aside className="admin-sidebar" id="admin-navigation" hidden={collapsed}>
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
      </aside>
      <div className="admin-main">
        <header className="admin-toolbar">
          <div className="admin-toolbar__context"><button type="button" className="admin-icon-button" aria-label={collapsed ? 'Mostrar navegación' : 'Ocultar navegación'} aria-expanded={!collapsed} aria-controls="admin-navigation" onClick={() => setCollapsed(!collapsed)}><SidebarSimpleIcon size={18} aria-hidden="true" /></button><nav className="admin-breadcrumb" aria-label="Ubicación"><NavLink to="/administracion" onClick={follow}>Administración</NavLink><CaretRightIcon size={12} aria-hidden="true" />{page !== current?.label && <><NavLink to={returnTo} onClick={follow}>Compras</NavLink><CaretRightIcon size={12} aria-hidden="true" /></>}<span aria-current="page" data-confirm-fallback tabIndex={-1}>{page}</span></nav></div>
          <div className="admin-toolbar__tools"><span className="admin-demo-tag">Demostración</span>{collapsed && <button className="admin-icon-button" aria-label="Cerrar sesión" onClick={event => { event.currentTarget.focus({ preventScroll: true }); void logout(event.currentTarget); }}><SignOutIcon size={18} aria-hidden="true" /></button>}</div>
        </header>
        <main className="admin-content" id="admin-content" ref={main} tabIndex={-1} onFocusCapture={event => revealFocus(event.target)}>
          <SessionWarning expiresAt={expiresAt} logout={logout} />
          <div key={location.pathname} className="cenit-page-enter">{children}</div>
        </main>
      </div>
    </div>
  </div>;
}
